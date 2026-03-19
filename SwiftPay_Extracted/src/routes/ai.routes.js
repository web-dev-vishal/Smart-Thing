import express from 'express';

const createAIRoutes = (aiController) => {
  const router = express.Router();

  /**
   * @route   GET /api/ai/usage
   * @desc    Get API usage statistics for external services
   * @access  Public
   */
  router.get('/usage', aiController.getAPIUsage);

  /**
   * @route   GET /api/ai/currencies
   * @desc    Get list of supported currencies
   * @access  Public
   */
  router.get('/currencies', aiController.getSupportedCurrencies);

  /**
   * @route   GET /api/ai/validate/currency
   * @desc    Validate currency and get exchange rate
   * @query   currency - Currency code (e.g., USD, EUR)
   * @query   amount - Optional amount to convert to USD
   * @access  Public
   */
  router.get('/validate/currency', aiController.validateCurrency);

  /**
   * @route   GET /api/ai/validate/ip
   * @desc    Validate IP address and get geolocation
   * @query   ip - IP address to validate
   * @access  Public
   */
  router.get('/validate/ip', aiController.validateIP);

  return router;
};

export default createAIRoutes;
