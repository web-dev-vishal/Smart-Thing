import express from "express";

// All routes here are public — no auth required.
// They proxy free public APIs with Redis caching to avoid hammering rate limits.
const createPublicApiRouter = (publicApiController) => {
    const router = express.Router();

    // Currency exchange rates and conversion
    router.get("/rates",              publicApiController.getExchangeRates);
    router.get("/convert",            publicApiController.convertCurrency);

    // Country information
    router.get("/countries",          publicApiController.getSupportedCountries);
    router.get("/country/:code",      publicApiController.getCountryInfo);

    // Cryptocurrency prices
    router.get("/crypto",             publicApiController.getCryptoPrices);
    router.get("/crypto/convert",     publicApiController.convertToCrypto);

    return router;
};

export default createPublicApiRouter;
