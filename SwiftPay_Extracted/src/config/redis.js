import Redis from 'ioredis';
import logger from '../utils/logger.js';

class RedisConnection {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        const options = {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          enableOfflineQueue: true,
          lazyConnect: false,
          connectTimeout: 10000,
          db: 0,
        };

        this.client = new Redis(options);

        this.client.on('connect', () => {
          logger.info('Redis connecting...');
        });

        this.client.on('ready', () => {
          this.isConnected = true;
          logger.info('Redis connected successfully', {
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
          });
          resolve(this.client);
        });

        this.client.on('error', (err) => {
          this.isConnected = false;
          logger.error('Redis connection error:', err);
          reject(err);
        });

        this.client.on('close', () => {
          this.isConnected = false;
          logger.warn('Redis connection closed');
        });

        this.client.on('reconnecting', () => {
          logger.info('Redis reconnecting...');
        });

      } catch (error) {
        logger.error('Failed to initialize Redis:', error);
        reject(error);
      }
    });
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.quit();
        this.isConnected = false;
        logger.info('Redis disconnected gracefully');
      }
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  getClient() {
    if (!this.isConnected || !this.client) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  async isHealthy() {
    try {
      if (!this.client) return false;
      const result = await this.client.ping();
      return result === 'PONG' && this.isConnected;
    } catch (error) {
      return false;
    }
  }
}

export default new RedisConnection();