import logger from "../utils/logger.js";

const CACHE_TTL = 60 * 60; // 1 hour

// Fallback rates relative to USD — used when the API is unavailable
const FALLBACK_RATES = {
    USD: 1.0,   EUR: 0.92,  GBP: 0.79,  INR: 83.12, CAD: 1.36,
    AUD: 1.52,  JPY: 149.5, CHF: 0.88,  CNY: 7.24,  MXN: 17.08,
    BRL: 4.97,  ZAR: 18.65, SGD: 1.34,  HKD: 7.82,  NZD: 1.64,
    SEK: 10.52, NOK: 10.68, DKK: 6.86,  PLN: 3.98,  THB: 34.25,
};

class CurrencyValidator {
    constructor(redisClient) {
        this.redis = redisClient;
        this.apiKey = process.env.EXCHANGE_RATE_API_KEY;
        this.enabled = process.env.ENABLE_CURRENCY_VALIDATION === "true";
    }

    async validateCurrency(currency, amount) {
        if (!this.enabled) {
            return { valid: true, exchangeRate: null, amountInUSD: null, cached: false };
        }

        if (!currency) {
            return { valid: false, error: "MISSING_CURRENCY", message: "Currency code is required" };
        }

        try {
            const cacheKey = `cache:currency:${currency}`;
            const cached = await this.redis.get(cacheKey);

            if (cached) {
                const data = JSON.parse(cached);
                return {
                    valid:        true,
                    exchangeRate: data.rate,
                    amountInUSD:  amount ? parseFloat((amount / data.rate).toFixed(2)) : null,
                    cached:       true,
                    lastUpdated:  data.lastUpdated,
                };
            }

            if (!this.apiKey) {
                logger.warn("Exchange rate API key not set — using fallback rates");
                return this._fallback(currency, amount);
            }

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 1500);

            const response = await fetch(
                `https://v6.exchangerate-api.com/v6/${this.apiKey}/latest/USD`,
                { signal: controller.signal }
            );

            clearTimeout(timeout);

            if (!response.ok) throw new Error(`Exchange rate API error: ${response.status}`);

            const data = await response.json();
            if (data.result !== "success") throw new Error(data["error-type"] || "API error");

            if (!data.conversion_rates[currency]) {
                return {
                    valid:   false,
                    error:   "INVALID_CURRENCY",
                    message: `Currency ${currency} is not supported`,
                };
            }

            const rate = data.conversion_rates[currency];
            await this.redis.setex(
                cacheKey,
                CACHE_TTL,
                JSON.stringify({ rate, lastUpdated: new Date().toISOString() })
            );

            return {
                valid:        true,
                exchangeRate: rate,
                amountInUSD:  amount ? parseFloat((amount / rate).toFixed(2)) : null,
                cached:       false,
                lastUpdated:  new Date().toISOString(),
            };
        } catch (error) {
            if (error.name === "AbortError") {
                logger.warn("Currency validation timed out", { currency });
            } else {
                logger.error("Currency validation failed", { currency, error: error.message });
            }

            return this._fallback(currency, amount);
        }
    }

    _fallback(currency, amount) {
        const rate = FALLBACK_RATES[currency];

        if (!rate) {
            return {
                valid:   false,
                error:   "CURRENCY_SERVICE_UNAVAILABLE",
                message: "Currency service unavailable and no fallback rate available",
            };
        }

        return {
            valid:        true,
            exchangeRate: rate,
            amountInUSD:  amount ? parseFloat((amount / rate).toFixed(2)) : null,
            cached:       false,
            fallback:     true,
            lastUpdated:  "fallback",
        };
    }

    getSupportedCurrencies() {
        const currencies = [
            "USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF", "CNY", "MXN",
            "BRL", "ZAR", "SGD", "HKD", "NZD", "SEK", "NOK", "DKK", "PLN", "THB",
            "KRW", "RUB", "TRY", "IDR", "MYR", "PHP", "VND", "AED", "SAR", "EGP",
        ];
        return { success: true, currencies, count: currencies.length };
    }
}

export default CurrencyValidator;
