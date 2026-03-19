import Transaction from '../models/Transaction.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import logger from '../utils/logger.js';
import { generateTransactionId, roundAmount } from '../utils/helpers.js';

class PayoutService {
  constructor(redisBalanceService, distributedLock, messagePublisher, websocketServer, ipValidator, currencyValidator, groqClient) {
    this.redisBalanceService = redisBalanceService;
    this.distributedLock = distributedLock;
    this.messagePublisher = messagePublisher;
    this.websocketServer = websocketServer;
    this.ipValidator = ipValidator;
    this.currencyValidator = currencyValidator;
    this.groqClient = groqClient;
  }

  async initiatePayout(payoutData, metadata = {}) {
    const { userId, amount, currency } = payoutData;
    const transactionId = generateTransactionId();
    const roundedAmount = roundAmount(amount);

    let lockValue = null;

    try {
      // Step 1: IP Geolocation Validation
      const user = await User.findByUserId(userId);
      if (!user) {
        throw new Error('USER_NOT_FOUND');
      }

      const ipValidation = await this.ipValidator.validateIP(
        metadata.ipAddress,
        user.country || 'US'
      );

      if (ipValidation.suspicious) {
        await AuditLog.logAction(transactionId, userId, 'IP_MISMATCH_DETECTED', {
          userCountry: user.country,
          ipCountry: ipValidation.country,
          ipAddress: metadata.ipAddress,
        });

        logger.warn('Suspicious IP detected', {
          userId,
          userCountry: user.country,
          ipCountry: ipValidation.country,
        });
      }

      // Step 2: Currency Validation
      const currencyValidation = await this.currencyValidator.validateCurrency(
        currency,
        roundedAmount
      );

      if (!currencyValidation.valid) {
        throw new Error(currencyValidation.error || 'INVALID_CURRENCY');
      }

      logger.info('Attempting to acquire lock', { userId, transactionId });

      lockValue = await this.distributedLock.acquireWithRetry(
        userId,
        parseInt(process.env.LOCK_TTL_MS) || 30000,
        3,
        100
      );

      if (!lockValue) {
        throw new Error('CONCURRENT_REQUEST_DETECTED');
      }

      await AuditLog.logAction(transactionId, userId, 'LOCK_ACQUIRED', {
        lockValue,
        ttl: process.env.LOCK_TTL_MS,
      });

      if (user.status !== 'active') {
        throw new Error('USER_NOT_ACTIVE');
      }

      let balance = await this.redisBalanceService.getBalance(userId);

      if (balance === null) {
        await this.redisBalanceService.syncBalance(userId, user.balance);
        balance = user.balance;
      }

      const hasSufficient = await this.redisBalanceService.hasSufficientBalance(
        userId,
        roundedAmount
      );

      if (!hasSufficient) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      // Step 3: AI Fraud Scoring
      const transactionCount = await Transaction.countDocuments({ userId });

      const fraudScore = await this.groqClient.scoreFraudRisk({
        userId,
        amount: roundedAmount,
        currency,
        ipCountry: ipValidation.country,
        userCountry: user.country || 'US',
        transactionCount,
      });

      await AuditLog.logAction(transactionId, userId, 'FRAUD_SCORE_CALCULATED', {
        riskScore: fraudScore.riskScore,
        reasoning: fraudScore.reasoning,
        recommendation: fraudScore.recommendation,
        aiAvailable: fraudScore.aiAvailable,
      });

      logger.info('Fraud score calculated', {
        transactionId,
        riskScore: fraudScore.riskScore,
        recommendation: fraudScore.recommendation,
      });

      const highRiskThreshold = parseInt(process.env.FRAUD_RISK_THRESHOLD) || 70;

      if (fraudScore.riskScore >= highRiskThreshold) {
        await AuditLog.logAction(transactionId, userId, 'HIGH_FRAUD_RISK_DETECTED', {
          riskScore: fraudScore.riskScore,
          threshold: highRiskThreshold,
        });

        throw new Error('HIGH_FRAUD_RISK');
      }

      const transaction = await Transaction.create({
        transactionId,
        userId,
        amount: roundedAmount,
        currency,
        status: 'initiated',
        type: 'payout',
        balanceBefore: balance,
        balanceAfter: balance - roundedAmount,
        metadata: {
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          source: metadata.source || 'api',
          description: payoutData.description,
          ipCountry: ipValidation.country,
          ipCity: ipValidation.city,
          exchangeRate: currencyValidation.exchangeRate,
          amountInUSD: currencyValidation.amountInUSD,
        },
        processingDetails: {
          initiatedAt: new Date(),
          fraudScore: fraudScore.riskScore,
          fraudReasoning: fraudScore.reasoning,
          ipSuspicious: ipValidation.suspicious,
        },
        lockInfo: {
          lockAcquired: true,
        },
      });

      await AuditLog.logAction(transactionId, userId, 'PAYOUT_INITIATED', {
        amount: roundedAmount,
        currency,
        balance,
        fraudScore: fraudScore.riskScore,
      });

      const messagePayload = {
        transactionId,
        userId,
        amount: roundedAmount,
        currency,
        lockValue,
        metadata: {
          source: metadata.source || 'api',
          description: payoutData.description,
        },
      };

      const published = await this.messagePublisher.publishPayoutMessage(messagePayload);

      if (!published) {
        throw new Error('FAILED_TO_PUBLISH_MESSAGE');
      }

      await AuditLog.logAction(transactionId, userId, 'MESSAGE_PUBLISHED', {
        queue: 'payout_queue',
      });

      this.websocketServer.emitPayoutInitiated(userId, {
        transactionId,
        amount: roundedAmount,
        currency,
        status: 'initiated',
        timestamp: new Date().toISOString(),
      });

      logger.info('Payout initiated successfully', {
        transactionId,
        userId,
        amount: roundedAmount,
        fraudScore: fraudScore.riskScore,
      });

      return {
        success: true,
        transactionId,
        status: 'initiated',
        amount: roundedAmount,
        currency,
        message: 'Payout request initiated successfully',
        fraudScore: fraudScore.riskScore,
      };

    } catch (error) {
      logger.error('Failed to initiate payout', {
        userId,
        transactionId,
        error: error.message,
      });

      if (lockValue) {
        await this.distributedLock.release(userId, lockValue);
        await AuditLog.logAction(transactionId, userId, 'LOCK_RELEASED', {
          reason: 'error',
        });
      }

      const errorMap = {
        CONCURRENT_REQUEST_DETECTED: {
          code: 'CONCURRENT_REQUEST',
          message: 'Another payout request is being processed. Please wait.',
          statusCode: 409,
        },
        USER_NOT_FOUND: {
          code: 'USER_NOT_FOUND',
          message: 'User not found',
          statusCode: 404,
        },
        USER_NOT_ACTIVE: {
          code: 'USER_NOT_ACTIVE',
          message: 'User account is not active',
          statusCode: 403,
        },
        INSUFFICIENT_BALANCE: {
          code: 'INSUFFICIENT_BALANCE',
          message: 'Insufficient balance for this payout',
          statusCode: 400,
        },
        INVALID_CURRENCY: {
          code: 'INVALID_CURRENCY',
          message: 'Invalid or unsupported currency code',
          statusCode: 400,
        },
        CURRENCY_SERVICE_UNAVAILABLE: {
          code: 'CURRENCY_SERVICE_UNAVAILABLE',
          message: 'Currency validation service is temporarily unavailable',
          statusCode: 503,
        },
        HIGH_FRAUD_RISK: {
          code: 'HIGH_FRAUD_RISK',
          message: 'Transaction flagged as high risk and requires manual review',
          statusCode: 403,
        },
        FAILED_TO_PUBLISH_MESSAGE: {
          code: 'QUEUE_ERROR',
          message: 'Failed to queue payout request',
          statusCode: 503,
        },
      };

      const errorInfo = errorMap[error.message] || {
        code: 'INTERNAL_ERROR',
        message: 'An error occurred while processing your request',
        statusCode: 500,
      };

      throw {
        ...errorInfo,
        originalError: error.message,
      };
    }
  }

  async getTransactionStatus(transactionId) {
    try {
      const transaction = await Transaction.findByTransactionId(transactionId);

      if (!transaction) {
        throw new Error('TRANSACTION_NOT_FOUND');
      }

      return {
        success: true,
        transaction: {
          transactionId: transaction.transactionId,
          userId: transaction.userId,
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          createdAt: transaction.createdAt,
          processingDetails: transaction.processingDetails,
        },
      };

    } catch (error) {
      logger.error('Failed to get transaction status', {
        transactionId,
        error: error.message,
      });

      throw {
        code: 'TRANSACTION_NOT_FOUND',
        message: 'Transaction not found',
        statusCode: 404,
      };
    }
  }

  async getUserBalance(userId) {
    try {
      let balance = await this.redisBalanceService.getBalance(userId);

      if (balance === null) {
        const user = await User.findByUserId(userId);
        if (!user) {
          throw new Error('USER_NOT_FOUND');
        }
        balance = user.balance;
        await this.redisBalanceService.syncBalance(userId, balance);
      }

      return {
        success: true,
        userId,
        balance,
        currency: 'USD',
      };

    } catch (error) {
      logger.error('Failed to get user balance', {
        userId,
        error: error.message,
      });

      throw {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
        statusCode: 404,
      };
    }
  }
}

export default PayoutService;