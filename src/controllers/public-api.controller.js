// Handles all public API endpoints — exchange rates, country info, crypto prices.
// All data comes from free public APIs (no API keys required).

class PublicApiController {
    constructor(publicApiService) {
        this.service = publicApiService;
    }

    // GET /api/public/rates?base=USD
    // Returns live exchange rates for all currencies relative to the base
    getExchangeRates = async (req, res, next) => {
        try {
            const base = req.query.base || "USD";
            const result = await this.service.getExchangeRates(base);

            res.status(200).json({
                success: true,
                ...result,
            });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/convert?amount=100&from=USD&to=EUR
    // Converts an amount from one currency to another using live rates
    convertCurrency = async (req, res, next) => {
        try {
            const { amount, from, to } = req.query;

            if (!amount || !from || !to) {
                return res.status(400).json({
                    success: false,
                    error:   "amount, from, and to are required",
                    code:    "MISSING_PARAMS",
                });
            }

            const parsed = parseFloat(amount);
            if (isNaN(parsed) || parsed <= 0) {
                return res.status(400).json({
                    success: false,
                    error:   "amount must be a positive number",
                    code:    "INVALID_AMOUNT",
                });
            }

            const result = await this.service.convertCurrency(parsed, from, to);

            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/country/:code
    // Returns country info — name, currencies, calling code, flag
    getCountryInfo = async (req, res, next) => {
        try {
            const { code } = req.params;

            if (!code || code.length !== 2) {
                return res.status(400).json({
                    success: false,
                    error:   "A valid 2-letter country code is required (e.g. US, GB, IN)",
                    code:    "INVALID_COUNTRY_CODE",
                });
            }

            const result = await this.service.getCountryInfo(code);

            res.status(200).json({ success: true, country: result });
        } catch (error) {
            // restcountries returns 404 for unknown codes — pass it through cleanly
            if (error.message?.includes("not found")) {
                return res.status(404).json({
                    success: false,
                    error:   `Country code '${req.params.code}' not found`,
                    code:    "COUNTRY_NOT_FOUND",
                });
            }
            next(error);
        }
    };

    // GET /api/public/countries
    // Returns a list of all countries with their currency codes — useful for frontend dropdowns
    getSupportedCountries = async (req, res, next) => {
        try {
            const result = await this.service.getSupportedCountries();

            res.status(200).json({
                success: true,
                count:   result.countries.length,
                cached:  result.cached,
                countries: result.countries,
            });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/crypto?coins=bitcoin,ethereum
    // Returns live USD prices for the requested coins
    getCryptoPrices = async (req, res, next) => {
        try {
            // Default to the most common coins if none specified
            const coins = req.query.coins
                ? req.query.coins.split(",").map((c) => c.trim().toLowerCase())
                : ["bitcoin", "ethereum", "tether", "usd-coin"];

            // Cap at 10 coins per request to avoid hammering the API
            if (coins.length > 10) {
                return res.status(400).json({
                    success: false,
                    error:   "Maximum 10 coins per request",
                    code:    "TOO_MANY_COINS",
                });
            }

            const result = await this.service.getCryptoPrices(coins);

            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/crypto/convert?amount=500&coin=bitcoin
    // Shows how much crypto you'd get for a given USD amount
    convertToCrypto = async (req, res, next) => {
        try {
            const { amount, coin } = req.query;

            if (!amount) {
                return res.status(400).json({
                    success: false,
                    error:   "amount (in USD) is required",
                    code:    "MISSING_AMOUNT",
                });
            }

            const parsed = parseFloat(amount);
            if (isNaN(parsed) || parsed <= 0) {
                return res.status(400).json({
                    success: false,
                    error:   "amount must be a positive number",
                    code:    "INVALID_AMOUNT",
                });
            }

            const result = await this.service.convertToCrypto(parsed, coin || "bitcoin");

            res.status(200).json({ success: true, ...result });
        } catch (error) {
            if (error.message?.includes("not found")) {
                return res.status(404).json({
                    success: false,
                    error:   error.message,
                    code:    "COIN_NOT_FOUND",
                });
            }
            next(error);
        }
    };
}

export default PublicApiController;
