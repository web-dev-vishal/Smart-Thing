// Handles all public API endpoints — exchange rates, country info, VAT, crypto, BIN lookup, postcodes.
// All data comes from free public APIs (no API keys required).
// Results are cached in Redis to avoid hammering rate limits.

class PublicApiController {
    constructor(publicApiService) {
        this.service = publicApiService;
    }

    // GET /api/public/rates?base=USD
    getExchangeRates = async (req, res, next) => {
        try {
            const base = req.query.base || "USD";
            const result = await this.service.getExchangeRates(base);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/convert?amount=100&from=USD&to=EUR
    convertCurrency = async (req, res, next) => {
        try {
            // amount is already coerced to a number by Zod; from/to are validated strings
            const { amount, from, to } = req.query;
            const result = await this.service.convertCurrency(amount, from, to);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/rates/historical?date=2024-01-15&base=USD
    // Returns exchange rates for a specific past date — useful for transaction auditing
    getHistoricalRates = async (req, res, next) => {
        try {
            // date is validated as YYYY-MM-DD by Zod; base is optional
            const { date, base } = req.query;
            const result = await this.service.getHistoricalRates(date, base || "USD");
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            if (error.message?.includes("YYYY-MM-DD")) {
                return res.status(400).json({ success: false, error: error.message, code: "INVALID_DATE_FORMAT" });
            }
            next(error);
        }
    };

    // GET /api/public/rates/historical/range?start=2024-01-01&end=2024-01-31&base=USD
    // Returns exchange rates over a date range — useful for charts and trend analysis
    getHistoricalRateRange = async (req, res, next) => {
        try {
            // start, end, and range ≤ 365 days are all validated by Zod
            const { start, end, base } = req.query;
            const result = await this.service.getHistoricalRateRange(start, end, base || "USD");
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/countries
    getSupportedCountries = async (req, res, next) => {
        try {
            const result = await this.service.getSupportedCountries();
            res.status(200).json({ success: true, count: result.countries.length, cached: result.cached, countries: result.countries });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/country/:code
    getCountryInfo = async (req, res, next) => {
        try {
            // code is validated as exactly 2 chars by Zod
            const { code } = req.params;

            const result = await this.service.getCountryInfo(code);
            res.status(200).json({ success: true, country: result });
        } catch (error) {
            if (error.message?.includes("not found")) {
                return res.status(404).json({ success: false, error: `Country code '${req.params.code}' not found`, code: "COUNTRY_NOT_FOUND" });
            }
            next(error);
        }
    };

    // GET /api/public/vat?country=DE
    // Returns VAT rates for a specific EU country, or all EU countries if no country given
    getVatRates = async (req, res, next) => {
        try {
            const { country } = req.query;
            const result = await this.service.getVatRates(country || null);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/crypto?coins=bitcoin,ethereum
    getCryptoPrices = async (req, res, next) => {
        try {
            // coins is already parsed into an array and capped at 10 by Zod
            const { coins } = req.query;
            const result = await this.service.getCryptoPrices(coins);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/public/crypto/convert?amount=500&coin=bitcoin
    convertToCrypto = async (req, res, next) => {
        try {
            // amount is already coerced to a positive number by Zod
            const { amount, coin } = req.query;
            const result = await this.service.convertToCrypto(amount, coin || "bitcoin");
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            if (error.message?.includes("not found")) {
                return res.status(404).json({ success: false, error: error.message, code: "COIN_NOT_FOUND" });
            }
            next(error);
        }
    };

    // GET /api/public/bin/:bin
    // Looks up a card BIN (first 6-8 digits) to identify the issuer, card type, and country.
    // Very useful for validating cards before initiating a payout.
    lookupCardBin = async (req, res, next) => {
        try {
            // bin is already stripped of non-digits and validated ≥ 6 chars by Zod
            const { bin } = req.params;
            const result = await this.service.lookupCardBin(bin);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            if (error.message?.includes("not found")) {
                return res.status(404).json({ success: false, error: error.message, code: "BIN_NOT_FOUND" });
            }
            next(error);
        }
    };

    // GET /api/public/postcode/:country/:postcode
    // Validates a postcode and returns the city/state it belongs to.
    lookupPostcode = async (req, res, next) => {
        try {
            // country (2-letter) and postcode are both validated by Zod
            const { country, postcode } = req.params;

            const result = await this.service.lookupPostcode(country, postcode);
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            // Zippopotam returns 404 for unknown postcodes
            if (error.message?.includes("404")) {
                return res.status(404).json({ success: false, error: `Postcode '${req.params.postcode}' not found in ${req.params.country}`, code: "POSTCODE_NOT_FOUND" });
            }
            next(error);
        }
    };
}

export default PublicApiController;
