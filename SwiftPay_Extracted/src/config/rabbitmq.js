import amqp from 'amqplib';
import logger from '../utils/logger.js';

class RabbitMQConnection {
  constructor() {
    this.connection = null;
    this.channel = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000;
  }

  async connect() {
    try {
      this.connection = await amqp.connect(process.env.RABBITMQ_URL, {
        heartbeat: 60,
      });

      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('RabbitMQ connected successfully');

      this.channel = await this.connection.createChannel();
      
      await this.channel.prefetch(parseInt(process.env.WORKER_CONCURRENCY) || 5);

      logger.info('RabbitMQ channel created successfully');

      await this.setupQueuesAndExchanges();

      this.connection.on('error', (err) => {
        logger.error('RabbitMQ connection error:', err);
        this.isConnected = false;
      });

      this.connection.on('close', () => {
        logger.warn('RabbitMQ connection closed');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.channel.on('error', (err) => {
        logger.error('RabbitMQ channel error:', err);
      });

      this.channel.on('close', () => {
        logger.warn('RabbitMQ channel closed');
      });

      return { connection: this.connection, channel: this.channel };

    } catch (error) {
      logger.error('Failed to connect to RabbitMQ:', error);
      this.isConnected = false;
      this.scheduleReconnect();
      throw error;
    }
  }

  async setupQueuesAndExchanges() {
    try {
      await this.channel.assertExchange('dlx_payout', 'direct', {
        durable: true,
      });

      await this.channel.assertQueue('payout_dlq', {
        durable: true,
      });

      await this.channel.bindQueue('payout_dlq', 'dlx_payout', 'payout');

      await this.channel.assertQueue('payout_queue', {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'dlx_payout',
          'x-dead-letter-routing-key': 'payout',
          'x-message-ttl': 86400000,
        },
      });

      logger.info('RabbitMQ queues and exchanges configured successfully');

    } catch (error) {
      logger.error('Failed to setup RabbitMQ queues:', error);
      throw error;
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    logger.info(`Scheduling RabbitMQ reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection attempt failed:', error);
      }
    }, delay);
  }

  async disconnect() {
    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.isConnected = false;
      logger.info('RabbitMQ disconnected gracefully');

    } catch (error) {
      logger.error('Error disconnecting from RabbitMQ:', error);
      throw error;
    }
  }

  getChannel() {
    if (!this.isConnected || !this.channel) {
      throw new Error('RabbitMQ channel is not available');
    }
    return this.channel;
  }

  getConnection() {
    if (!this.isConnected || !this.connection) {
      throw new Error('RabbitMQ connection is not available');
    }
    return this.connection;
  }

  isHealthy() {
    return this.isConnected && this.channel !== null;
  }
}

export default new RabbitMQConnection();