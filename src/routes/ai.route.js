import express from "express";

const createAIRouter = (aiController) => {
    const router = express.Router();

    router.get("/usage",             aiController.getAPIUsage);
    router.get("/currencies",        aiController.getSupportedCurrencies);
    router.get("/validate/currency", aiController.validateCurrency);
    router.get("/validate/ip",       aiController.validateIP);

    return router;
};

export default createAIRouter;
