import logger from '../utils/logger.js';

class PayoutController {
  constructor(payoutService) {
    this.payoutService = payoutService;
  }

  createPayout = async (req, res, next) => {
    try {
      const { userId, amount, currency, description } = req.body;

      const metadata = {
        ipAddress: req.ip || req.socket?.remoteAddress,
        userAgent: req.get('user-agent'),
        source: 'api',
      };

      logger.info('Received payout request', {
        userId,
        amount,
        currency,
        ip: metadata.ipAddress,
      });

      const result = await this.payoutService.initiatePayout(
        { userId, amount, currency, description },
        metadata
      );

      res.status(202).json(result);

    } catch (error) {
      next(error);
    }
  };

  getTransactionStatus = async (req, res, next) => {
    try {
      const { transactionId } = req.params;

      logger.info('Fetching transaction status', { transactionId });

      const result = await this.payoutService.getTransactionStatus(transactionId);

      res.status(200).json(result);

    } catch (error) {
      next(error);
    }
  };

  getUserBalance = async (req, res, next) => {
    try {
      const { userId } = req.params;

      logger.info('Fetching user balance', { userId });

      const result = await this.payoutService.getUserBalance(userId);

      res.status(200).json(result);

    } catch (error) {
      next(error);
    }
  };

  getTransactionHistory = async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { limit = 50, status } = req.query;

      logger.info('Fetching transaction history', { userId, limit, status });

      const Transaction = (await import('../models/Transaction.js')).default;

      const query = { userId };
      if (status) {
        query.status = status;
      }

      const transactions = await Transaction.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('-__v')
        .lean();

      res.status(200).json({
        success: true,
        count: transactions.length,
        transactions,
      });

    } catch (error) {
      next(error);
    }
  };
}

export default PayoutController;