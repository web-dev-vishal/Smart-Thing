import logger from '../utils/logger.js';

class MessageConsumer {
  constructor(channel, handler) {
    this.channel = channel;
    this.handler = handler;
    this.consumerTag = null;
  }

  async startConsuming(queueName = 'payout_queue') {
    try {
      const { consumerTag } = await this.channel.consume(
        queueName,
        async (msg) => {
          if (msg === null) {
            logger.warn('Consumer cancelled by server');
            return;
          }

          await this.handleMessage(msg);
        },
        {
          noAck: false,
        }
      );

      this.consumerTag = consumerTag;
      logger.info(`Started consuming messages from ${queueName}`, {
        consumerTag,
      });

    } catch (error) {
      logger.error('Error starting consumer:', error);
      throw error;
    }
  }

  async handleMessage(msg) {
    const startTime = Date.now();
    let payload;

    try {
      payload = JSON.parse(msg.content.toString());
      
      logger.info('Processing message', {
        transactionId: payload.transactionId,
        userId: payload.userId,
        retryCount: msg.properties.headers['x-retry-count'] || 0,
      });

      await this.handler(payload, msg);

      this.channel.ack(msg);

      const processingTime = Date.now() - startTime;
      logger.info('Message processed successfully', {
        transactionId: payload.transactionId,
        processingTimeMs: processingTime,
      });

    } catch (error) {
      const processingTime = Date.now() - startTime;
      logger.error('Error processing message:', {
        error: error.message,
        transactionId: payload?.transactionId,
        processingTimeMs: processingTime,
      });

      await this.handleFailure(msg, error, payload);
    }
  }

  async handleFailure(msg, error, payload) {
    try {
      const retryCount = (msg.properties.headers['x-retry-count'] || 0) + 1;
      const maxRetries = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 3;

      if (retryCount <= maxRetries) {
        logger.warn(`Requeuing message (attempt ${retryCount}/${maxRetries})`, {
          transactionId: payload?.transactionId,
        });

        this.channel.nack(msg, false, false);

        setTimeout(() => {
          this.channel.sendToQueue(
            'payout_queue',
            msg.content,
            {
              ...msg.properties,
              headers: {
                ...msg.properties.headers,
                'x-retry-count': retryCount,
              },
            }
          );
        }, parseInt(process.env.RETRY_DELAY_MS) || 5000);

      } else {
        logger.error('Max retries reached - sending to DLQ', {
          transactionId: payload?.transactionId,
          retryCount,
        });

        this.channel.nack(msg, false, false);
      }

    } catch (error) {
      logger.error('Error handling message failure:', error);
      this.channel.nack(msg, false, false);
    }
  }

  async stopConsuming() {
    try {
      if (this.consumerTag) {
        await this.channel.cancel(this.consumerTag);
        logger.info('Stopped consuming messages', {
          consumerTag: this.consumerTag,
        });
        this.consumerTag = null;
      }
    } catch (error) {
      logger.error('Error stopping consumer:', error);
      throw error;
    }
  }
}

export default MessageConsumer;