// AI controller — exposes utility endpoints for currency validation, IP lookup, and API usage stats.
// These are used by the frontend and internal tools to check system health and validate inputs.

import logger from "../utils/logger.js";

class AIController {
    constructor(ipValidator, currencyValidator) {
        this.ipValidator       = ipValidator;
        this.currencyValidator = currencyValidator;
    }

    // GET /api/ai/usage
    // Returns today's API call counts for each external service we use.
    // Useful for monitoring how close we are to free tier limits.
    getAPIUsage = async (req, res, next) => {
        try {
            const services = ["ipapi", "exchangerate", "groq"];

            // Fetch usage stats for all services in parallel
            const usage = await Promise.all(services.map((s) => this.ipValidator.getAPIUsage(s)));

            res.status(200).json({ success: true, usage, timestamp: new Date().toISOString() });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/ai/currencies
    // Returns the list of currency codes we support for payouts.
    getSupportedCurrencies = async (req, res, next) => {
        try {
            const result = this.currencyValidator.getSupportedCurrencies();
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    // GET /api/ai/validate/currency?currency=EUR&amount=100
    // Checks if a currency code is valid and returns its exchange rate vs USD.
    // The amount parameter is optional — if provided, we also return the USD equivalent.
    validateCurrency = async (req, res, next) => {
        try {
            // currency and amount are already validated + coerced by Zod middleware
            const { currency, amount } = req.query;

            const result = await this.currencyValidator.validateCurrency(
                currency.toUpperCase(),
                amount ?? null
            );

            if (!result.valid) {
                return res.status(400).json({
                    success: false,
                    error:   result.message || "Invalid currency",
                    code:    result.error || "INVALID_CURRENCY",
                });
            }

            res.status(200).json({
                success:      true,
                currency:     currency.toUpperCase(),
                exchangeRate: result.exchangeRate,
                amountInUSD:  result.amountInUSD,
                cached:       result.cached,
                fallback:     result.fallback || false,
                lastUpdated:  result.lastUpdated,
            });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/ai/validate/ip?ip=1.2.3.4
    // Looks up an IP address and returns its country and city.
    // Useful for debugging suspicious transaction flags.
    validateIP = async (req, res, next) => {
        try {
            // ip is already validated by Zod middleware
            const { ip } = req.query;

            // Pass null as userCountry — we're just doing a lookup, not a mismatch check
            const result = await this.ipValidator.validateIP(ip, null);

            if (!result.valid) {
                return res.status(400).json({
                    success: false,
                    error:   result.error || "Invalid IP address",
                    code:    "INVALID_IP",
                });
            }

            res.status(200).json({
                success: true,
                ip,
                country: result.country,
                city:    result.city,
                region:  result.region,
                cached:  result.cached,
            });
        } catch (error) {
            next(error);
        }
    };
}

export default AIController;
