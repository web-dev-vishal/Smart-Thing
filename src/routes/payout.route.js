// Payout routes — endpoints for creating payouts, managing payout user profiles,
// wallet operations, and transaction history/export.

import express from "express";
import { validatePayout } from "../validators/payout.validate.js";

const createPayoutRouter = (payoutController, userRateLimiter) => {
    const router = express.Router();

    // ── Payout user profile management ───────────────────────────────────────

    // POST /api/payout/user — register a new payout profile for a user
    router.post("/user",                              payoutController.createPayoutUser);

    // GET /api/payout/user/:userId — get a single payout user's profile
    router.get("/user/:userId",                       payoutController.getPayoutUser);

    // PUT /api/payout/user/:userId — update email, phone, country, or currency
    router.put("/user/:userId",                       payoutController.updatePayoutUser);

    // DELETE /api/payout/user/:userId — remove a payout profile
    router.delete("/user/:userId",                    payoutController.deletePayoutUser);

    // ── Balance and wallet ────────────────────────────────────────────────────

    // GET /api/payout/user/:userId/balance — get primary balance (USD or user's currency)
    router.get("/user/:userId/balance",               payoutController.getUserBalance);

    // GET /api/payout/user/:userId/wallet — get all multi-currency wallet balances
    router.get("/user/:userId/wallet",                payoutController.getWallet);

    // POST /api/payout/user/:userId/wallet/credit — add funds to a currency wallet
    router.post("/user/:userId/wallet/credit",        payoutController.creditWallet);

    // POST /api/payout/user/:userId/wallet/debit — deduct funds from a currency wallet
    router.post("/user/:userId/wallet/debit",         payoutController.debitWallet);

    // ── Transaction history and export ────────────────────────────────────────

    // GET /api/payout/user/:userId/history — recent transactions (?limit, ?status)
    router.get("/user/:userId/history",               payoutController.getTransactionHistory);

    // GET /api/payout/user/:userId/export — download transactions (?format=csv|json)
    router.get("/user/:userId/export",                payoutController.exportTransactions);

    // ── Create payout ─────────────────────────────────────────────────────────

    // POST /api/payout — create a new payout request
    // Rate limiter → input validation → controller
    router.post(
        "/",
        userRateLimiter,
        validatePayout,
        payoutController.createPayout
    );

    // GET /api/payout/:transactionId — get status of a specific transaction
    // Keep this last — :transactionId would match /user/:userId routes if registered first
    router.get("/:transactionId",                     payoutController.getTransactionStatus);

    return router;
};

export default createPayoutRouter;
