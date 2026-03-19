import express from 'express';
import createPayoutRouter from './payout.routes.js';
import createHealthRouter from './health.routes.js';
import createAIRouter from './ai.routes.js';

const createRouter = (dependencies) => {
  const { payoutController, userRateLimiter, healthDependencies, aiController } = dependencies;

  const router = express.Router();

  router.use('/health', createHealthRouter(healthDependencies));

  router.use('/payout', createPayoutRouter(payoutController, userRateLimiter));

  if (aiController) {
    router.use('/ai', createAIRouter(aiController));
  }

  router.get('/', (req, res) => {
    res.json({
      success: true,
      service: 'SwiftPay API Gateway',
      version: '1.0.0',
      features: {
        aiPowered: process.env.ENABLE_AI_FEATURES === 'true',
        fraudDetection: process.env.ENABLE_AI_FEATURES === 'true',
        ipValidation: process.env.ENABLE_IP_VALIDATION === 'true',
        currencyValidation: process.env.ENABLE_CURRENCY_VALIDATION === 'true',
      },
      endpoints: {
        health: '/api/health',
        payout: '/api/payout',
        transaction: '/api/payout/:transactionId',
        balance: '/api/payout/user/:userId/balance',
        history: '/api/payout/user/:userId/history',
        aiUsage: '/api/ai/usage',
        currencies: '/api/ai/currencies',
        validateCurrency: '/api/ai/validate/currency',
        validateIP: '/api/ai/validate/ip',
      },
      documentation: 'https://github.com/web-dev-vishal/SwiftPay',
    });
  });

  return router;
};

export default createRouter;