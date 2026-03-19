import logger from '../utils/logger.js';

class MessagePublisher {
  constructor(channel) {
    this.channel = channel;
  }

  async publishPayoutMessage(payload) {
    try {
      const message = {
        transactionId: payload.transactionId,
        userId: payload.userId,
        amount: payload.amount,
        currency: payload.currency,
        lockValue: payload.lockValue,
        metadata: payload.metadata,
        timestamp: new Date().toISOString(),
      };

      const sent = this.channel.sendToQueue(
        'payout_queue',
        Buffer.from(JSON.stringify(message)),
        {
          persistent: true,
          contentType: 'application/json',
          messageId: payload.transactionId,
          timestamp: Date.now(),
          headers: {
            'x-retry-count': 0,
            'x-source': 'api-gateway',
          },
        }
      );

      if (sent) {
        logger.info(`Message published to payout_queue`, {
          transactionId: payload.transactionId,
          userId: payload.userId,
        });
        return true;
      } else {
        logger.error('Failed to publish message - queue buffer full');
        return false;
      }

    } catch (error) {
      logger.error('Error publishing message to RabbitMQ:', error);
      throw error;
    }
  }

  async publishWithConfirmation(payload) {
    try {
      await this.channel.confirmSelect();

      const message = {
        transactionId: payload.transactionId,
        userId: payload.userId,
        amount: payload.amount,
        currency: payload.currency,
        metadata: payload.metadata,
        timestamp: new Date().toISOString(),
      };

      return new Promise((resolve, reject) => {
        this.channel.sendToQueue(
          'payout_queue',
          Buffer.from(JSON.stringify(message)),
          {
            persistent: true,
            contentType: 'application/json',
            messageId: payload.transactionId,
            timestamp: Date.now(),
          },
          (err, ok) => {
            if (err) {
              logger.error('Message publish confirmation failed:', err);
              reject(err);
            } else {
              logger.info('Message publish confirmed', {
                transactionId: payload.transactionId,
              });
              resolve(true);
            }
          }
        );
      });

    } catch (error) {
      logger.error('Error publishing message with confirmation:', error);
      throw error;
    }
  }
}

export default MessagePublisher;