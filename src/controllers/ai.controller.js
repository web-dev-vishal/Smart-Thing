import logger from "../utils/logger.js";

class AIController {
    constructor(ipValidator, currencyValidator) {
        this.ipValidator       = ipValidator;
        this.currencyValidator = currencyValidator;
    }

    getAPIUsage = async (req, res, next) => {
        try {
            const services = ["ipapi", "exchangerate", "groq"];
            const usage = await Promise.all(services.map((s) => this.ipValidator.getAPIUsage(s)));
            res.status(200).json({ success: true, usage, timestamp: new Date().toISOString() });
        } catch (error) {
            next(error);
        }
    };

    getSupportedCurrencies = async (req, res, next) => {
        try {
            const result = this.currencyValidator.getSupportedCurrencies();
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    validateCurrency = async (req, res, next) => {
        try {
            const { currency, amount } = req.query;

            if (!currency) {
                return res.status(400).json({
                    success: false,
                    error:   "Currency code is required",
                    code:    "MISSING_CURRENCY",
                });
            }

            const result = await this.currencyValidator.validateCurrency(
                currency.toUpperCase(),
                amount ? parseFloat(amount) : null
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

    validateIP = async (req, res, next) => {
        try {
            const { ip } = req.query;

            if (!ip) {
                return res.status(400).json({
                    success: false,
                    error:   "IP address is required",
                    code:    "MISSING_IP",
                });
            }

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
