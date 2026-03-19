import express from "express";
import { validatePayout } from "../validators/payout.validate.js";

const createPayoutRouter = (payoutController, userRateLimiter) => {
    const router = express.Router();

    router.post(
        "/",
        userRateLimiter,
        validatePayout,
        payoutController.createPayout
    );

    router.get("/user/:userId/balance",  payoutController.getUserBalance);
    router.get("/user/:userId/history",  payoutController.getTransactionHistory);

    // Keep this last — :transactionId would match /user/:userId otherwise
    router.get("/:transactionId",        payoutController.getTransactionStatus);

    return router;
};

export default createPayoutRouter;
