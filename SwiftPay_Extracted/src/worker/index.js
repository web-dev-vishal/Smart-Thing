import 'dotenv/config';

import database from '../config/database.js';
import redisConnection from '../config/redis.js';
import rabbitmq from '../config/rabbitmq.js';

import DistributedLock from '../services/DistributedLock.js';
import RedisBalanceService from '../services/RedisBalanceService.js';
import MessageConsumer from '../services/MessageConsumer.js';
import GroqClient from '../services/GroqClient.js';

import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';

import logger from '../utils/logger.js';
import { calculateDuration } from '../utils/helpers.js';

class WorkerService {
  constructor() {
    this.redis = null;
    this.rabbitmqChannel = null;
    this.balanceService = null;
    this.distributedLock = null;
    this.consumer = null;
    this.groqClient = null;
    this.isShuttingDown = false;
  }

  async initialize() {
    try {
      logger.info('Starting SwiftPay Worker Service...');

      logger.info('Connecting to MongoDB...');
      await database.connect();

      logger.info('Connecting to Redis...');
      await redisConnection.connect();
      this.redis = redisConnection.getClient();

      logger.info('Connecting to RabbitMQ...');
      await rabbitmq.connect();
      this.rabbitmqChannel = rabbitmq.getChannel();

      this.balanceService = new RedisBalanceService(this.redis);
      this.distributedLock = new DistributedLock(this.redis);
      this.groqClient = new GroqClient();

      logger.info('SwiftPay Worker Service initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize Worker Service:', error);
      throw error;
    }
  }

  async processPayoutMessage(payload, msg) {
    const startTime = new Date();
    const { transactionId, userId, amount, currency } = payload;

    let transaction = null;

    try {
      logger.info('Processing payout message', {
        transactionId,
        userId,
        amount,
      });

      transaction = await Transaction.findByTransactionId(transactionId);

      if (!transaction) {
        throw new Error('TRANSACTION_NOT_FOUND');
      }

      if (transaction.status === 'completed') {
        logger.warn('Transaction already completed (idempotent)', {
          transactionId,
        });
        return;
      }

      if (transaction.status === 'processing') {
        logger.warn('Transaction already being processed', {
          transactionId,
        });
        throw new Error('ALREADY_PROCESSING');
      }

      await transaction.markAsProcessing();

      await AuditLog.logAction(transactionId, userId, 'PAYOUT_PROCESSING', {
        status: 'processing',
      });

      await this.emitWebSocketEvent(userId, 'PAYOUT_PROCESSING', {
        transactionId,
        amount,
        currency,
      });

      const currentBalance = await this.balanceService.getBalance(userId);

      if (currentBalance === null) {
        throw new Error('BALANCE_NOT_FOUND');
      }

      if (currentBalance < amount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      logger.debug('Balance validation passed', {
        transactionId,
        currentBalance,
        amount,
      });

      const newBalance = await this.balanceService.deductBalance(userId, amount);

      await AuditLog.logAction(transactionId, userId, 'BALANCE_DEDUCTED', {
        previousBalance: currentBalance,
        newBalance,
        amount,
      });

      logger.info('Balance deducted successfully', {
        transactionId,
        previousBalance: currentBalance,
        newBalance,
      });

      transaction.balanceAfter = newBalance;
      await transaction.markAsCompleted();

      await User.updateOne(
        { userId },
        {
          $set: { balance: newBalance },
          $inc: {
            'metadata.totalPayouts': 1,
            'metadata.totalPayoutAmount': amount,
          },
          $currentDate: { 'metadata.lastPayoutAt': true },
        }
      );

      try {
        if (payload.lockValue) {
          // Safe release: compare-and-delete via Lua script (prevents race conditions)
          await this.distributedLock.release(userId, payload.lockValue);
        } else {
          // Fallback for messages sent before lockValue was added to payload
          await this.redis.del(`lock:${userId}`);
        }

        await AuditLog.logAction(transactionId, userId, 'LOCK_RELEASED', {
          success: true,
        });
      } catch (lockError) {
        logger.warn('Failed to release lock', {
          transactionId,
          error: lockError.message,
        });
      }

      await this.emitWebSocketEvent(userId, 'PAYOUT_COMPLETED', {
        transactionId,
        amount,
        currency,
        newBalance,
      });

      await AuditLog.logAction(transactionId, userId, 'PAYOUT_COMPLETED', {
        amount,
        newBalance,
        processingTimeMs: calculateDuration(startTime),
      });

      // Step 4: Anomaly Detection (after completion)
      await this.performAnomalyDetection(transaction, userId);

      logger.info('Payout processed successfully', {
        transactionId,
        userId,
        amount,
        processingTimeMs: calculateDuration(startTime),
      });

    } catch (error) {
      logger.error('Failed to process payout', {
        transactionId,
        userId,
        error: error.message,
        processingTimeMs: calculateDuration(startTime),
      });

      if (error.message !== 'TRANSACTION_NOT_FOUND' &&
        error.message !== 'ALREADY_PROCESSING' &&
        error.message !== 'INSUFFICIENT_BALANCE') {

        try {
          await this.balanceService.addBalance(userId, amount);

          await AuditLog.logAction(transactionId, userId, 'BALANCE_RESTORED', {
            amount,
            reason: 'error_rollback',
          });

          logger.info('Balance restored due to error', {
            transactionId,
            amount,
          });

        } catch (rollbackError) {
          logger.error('Failed to rollback balance', {
            transactionId,
            error: rollbackError.message,
          });
        }
      }

      if (transaction) {
        await transaction.markAsFailed(error);
      }

      await this.emitWebSocketEvent(userId, 'PAYOUT_FAILED', {
        transactionId,
        amount,
        currency,
        error: error.message,
      });

      await AuditLog.logAction(transactionId, userId, 'PAYOUT_FAILED', {
        error: error.message,
        processingTimeMs: calculateDuration(startTime),
      });

      throw error;
    }
  }

  async emitWebSocketEvent(userId, event, data) {
    try {
      const message = JSON.stringify({
        userId,
        event,
        data,
        timestamp: new Date().toISOString(),
      });

      await this.redis.publish('websocket:events', message);

      logger.debug('WebSocket event published to Redis', {
        userId,
        event,
      });

    } catch (error) {
      logger.error('Failed to publish WebSocket event', {
        userId,
        event,
        error: error.message,
      });
    }
  }

  async performAnomalyDetection(transaction, userId) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const transactionHistory = await Transaction.find({
        userId,
        status: 'completed',
        createdAt: { $gte: thirtyDaysAgo },
        _id: { $ne: transaction._id },
      })
        .select('amount currency createdAt')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      if (transactionHistory.length === 0) {
        logger.debug('No transaction history for anomaly detection', { userId });
        return;
      }

      const anomalyResult = await this.groqClient.detectAnomaly(
        {
          amount: transaction.amount,
          currency: transaction.currency,
          createdAt: transaction.createdAt,
        },
        transactionHistory
      );

      if (anomalyResult.isAnomaly) {
        await AuditLog.logAction(
          transaction.transactionId,
          userId,
          'ANOMALY_DETECTED',
          {
            confidence: anomalyResult.confidence,
            explanation: anomalyResult.explanation,
            aiAvailable: anomalyResult.aiAvailable,
            historicalTransactions: transactionHistory.length,
          }
        );

        logger.warn('Transaction anomaly detected', {
          transactionId: transaction.transactionId,
          userId,
          confidence: anomalyResult.confidence,
          explanation: anomalyResult.explanation,
        });
      } else {
        logger.debug('No anomaly detected', {
          transactionId: transaction.transactionId,
          userId,
        });
      }

    } catch (error) {
      logger.error('Anomaly detection failed', {
        transactionId: transaction.transactionId,
        userId,
        error: error.message,
      });
    }
  }

  async start() {
    try {
      this.consumer = new MessageConsumer(
        this.rabbitmqChannel,
        this.processPayoutMessage.bind(this)
      );

      await this.consumer.startConsuming('payout_queue');

      const concurrency = parseInt(process.env.WORKER_CONCURRENCY) || 5;
      logger.info(`Worker Service started successfully`, {
        concurrency,
        queue: 'payout_queue',
      });

    } catch (error) {
      logger.error('Failed to start Worker Service:', error);
      throw error;
    }
  }

  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down SwiftPay Worker Service...');

    try {
      if (this.consumer) {
        await this.consumer.stopConsuming();
      }

      logger.info('Waiting for in-flight messages to complete...');
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await rabbitmq.disconnect();

      await redisConnection.disconnect();

      await database.disconnect();

      logger.info('SwiftPay Worker Service shut down successfully');
      process.exit(0);

    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

const worker = new WorkerService();

(async () => {
  try {
    await worker.initialize();
    await worker.start();
  } catch (error) {
    logger.error('Failed to start Worker Service:', error);
    process.exit(1);
  }
})();

process.on('SIGTERM', () => worker.shutdown());
process.on('SIGINT', () => worker.shutdown());

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  worker.shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  worker.shutdown();
});

export default worker;