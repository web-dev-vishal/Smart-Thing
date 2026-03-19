import express from 'express';
import { validate } from '../middleware/validation.js';
import { payoutRequestSchema } from '../validators/payout.validator.js';

const createPayoutRouter = (payoutController, userRateLimiter) => {
  const router = express.Router();

  router.post(
    '/',
    userRateLimiter,
    validate(payoutRequestSchema),
    payoutController.createPayout
  );

  router.get(
    '/:transactionId',
    payoutController.getTransactionStatus
  );

  router.get(
    '/user/:userId/balance',
    payoutController.getUserBalance
  );

  router.get(
    '/user/:userId/history',
    payoutController.getTransactionHistory
  );

  return router;
};

export default createPayoutRouter;