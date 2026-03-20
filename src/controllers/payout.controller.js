// Payout controller — handles HTTP requests for creating and checking payouts.
// Thin layer: extract request data, call the service, return the result.
// All the heavy lifting (fraud scoring, balance checks, locking) is in payout.service.js.

import logger from "../utils/logger.js";
import { getClientIP } from "../utils/helpers.js";
import PayoutUser from "../models/payout-user.model.js";
import Transaction from "../models/transaction.model.js";
import { SUPPORTED_CURRENCIES } from "../utils/constants.js";

class PayoutController {
    constructor(payoutService) {
        this.payoutService = payoutService;
    }

    // POST /api/payout
    // Initiates a new payout request.
    // Returns 202 Accepted — the payout is queued, not yet completed.
    createPayout = async (req, res, next) => {
        try {
            const { userId, amount, currency, description } = req.body;

            // Collect metadata for fraud scoring and audit logging
            const metadata = {
                ipAddress: getClientIP(req),
                userAgent: req.get("user-agent"),
                source:    "api",
            };

            logger.info("Payout request received", { userId, amount, currency, ip: metadata.ipAddress });

            const result = await this.payoutService.initiatePayout(
                { userId, amount, currency, description },
                metadata
            );

            // 202 = accepted for processing, not yet completed
            res.status(202).json(result);
        } catch (error) {
            // Pass structured errors (from ERROR_MAP) to the error middleware
            next(error);
        }
    };

    // GET /api/payout/:transactionId
    // Returns the current status of a specific transaction.
    getTransactionStatus = async (req, res, next) => {
        try {
            const { transactionId } = req.params;
            const result = await this.payoutService.getTransactionStatus(transactionId);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    // GET /api/payout/user/:userId/balance
    // Returns the user's current balance from Redis (or MongoDB if not cached).
    getUserBalance = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const result = await this.payoutService.getUserBalance(userId);
            res.status(200).json(result);
        } catch (error) {
            next(error);
        }
    };

    // GET /api/payout/user/:userId/history
    // Returns recent transactions for a user.
    // Supports ?limit=N and ?status=completed|failed|initiated filtering.
    getTransactionHistory = async (req, res, next) => {
        try {
            const { userId } = req.params;

            // Cap at 200 to prevent huge responses — default is 50
            const limit  = Math.min(parseInt(req.query.limit) || 50, 200);
            const status = req.query.status;

            const query = { userId };
            if (status) query.status = status;

            const transactions = await Transaction.find(query)
                .sort({ createdAt: -1 })  // Newest first
                .limit(limit)
                .select("-__v")           // Don't expose the internal version field
                .lean();                  // Plain JS objects are faster than Mongoose documents

            res.status(200).json({
                success:      true,
                count:        transactions.length,
                transactions,
            });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/payout/user/:userId — get a single payout user's profile
    getPayoutUser = async (req, res, next) => {
        try {
            const { userId } = req.params;

            const user = await PayoutUser.findByUserId(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: "Payout user not found" });
            }

            // Convert the wallet Map to a plain object so it serialises cleanly
            const wallet = Object.fromEntries(user.wallet || new Map());

            res.json({ success: true, user: { ...user.toObject(), wallet } });
        } catch (error) {
            next(error);
        }
    };

    // POST /api/payout/user — create a new payout user profile
    // This registers a user into the payout system (separate from auth).
    createPayoutUser = async (req, res, next) => {        try {
            const { userId, currency, country, email, phone, initialBalance } = req.body;

            if (!userId) {
                return res.status(400).json({ success: false, message: "userId is required" });
            }

            // Check if a profile already exists for this user
            const existing = await PayoutUser.findByUserId(userId);
            if (existing) {
                return res.status(409).json({ success: false, message: "Payout profile already exists for this user" });
            }

            const user = await PayoutUser.create({
                userId,
                currency: currency || "USD",
                country:  country  || "US",
                email,
                phone,
                balance:  parseFloat(initialBalance) || 0,
            });

            logger.info("Payout user profile created", { userId });

            res.status(201).json({ success: true, message: "Payout profile created", user });
        } catch (error) {
            next(error);
        }
    };

    // PUT /api/payout/user/:userId — update a payout user's profile fields
    // Only updates fields that are actually sent in the request body.
    updatePayoutUser = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { currency, country, email, phone } = req.body;

            const updates = {};
            if (currency) {
                if (!SUPPORTED_CURRENCIES.includes(currency)) {
                    return res.status(400).json({ success: false, message: `Unsupported currency: ${currency}` });
                }
                updates.currency = currency;
            }
            if (country) updates.country = country;
            if (email)   updates.email   = email;
            if (phone)   updates.phone   = phone;

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({ success: false, message: "No valid fields provided to update" });
            }

            const user = await PayoutUser.findOneAndUpdate(
                { userId },
                { $set: updates },
                { new: true }
            );

            if (!user) {
                return res.status(404).json({ success: false, message: "Payout user not found" });
            }

            res.json({ success: true, message: "Payout profile updated", user });
        } catch (error) {
            next(error);
        }
    };

    // DELETE /api/payout/user/:userId — remove a payout user profile
    deletePayoutUser = async (req, res, next) => {
        try {
            const { userId } = req.params;

            const user = await PayoutUser.findOneAndDelete({ userId });
            if (!user) {
                return res.status(404).json({ success: false, message: "Payout user not found" });
            }

            logger.info("Payout user profile deleted", { userId });

            res.json({ success: true, message: "Payout profile deleted" });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/payout/user/:userId/wallet — get all wallet balances for a user
    getWallet = async (req, res, next) => {
        try {
            const { userId } = req.params;

            const user = await PayoutUser.findByUserId(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: "Payout user not found" });
            }

            // Convert the Map to a plain object for the JSON response
            const wallet = Object.fromEntries(user.wallet || new Map());

            res.json({
                success:         true,
                userId,
                primaryBalance:  user.balance,
                primaryCurrency: user.currency,
                wallet,
            });
        } catch (error) {
            next(error);
        }
    };

    // POST /api/payout/user/:userId/wallet/credit — add funds to a specific currency wallet
    creditWallet = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { currency, amount } = req.body;

            if (!currency || !amount) {
                return res.status(400).json({ success: false, message: "currency and amount are required" });
            }

            if (!SUPPORTED_CURRENCIES.includes(currency)) {
                return res.status(400).json({ success: false, message: `Unsupported currency: ${currency}` });
            }

            const creditAmount = parseFloat(amount);
            if (isNaN(creditAmount) || creditAmount <= 0) {
                return res.status(400).json({ success: false, message: "amount must be a positive number" });
            }

            const user = await PayoutUser.findByUserId(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: "Payout user not found" });
            }

            // Get the current wallet balance for this currency (default 0 if not set)
            const currentBalance = user.wallet.get(currency) || 0;
            const newBalance     = currentBalance + creditAmount;

            // Update the specific currency key in the wallet Map
            user.wallet.set(currency, newBalance);
            await user.save();

            logger.info("Wallet credited", { userId, currency, amount: creditAmount });

            res.json({
                success:    true,
                message:    `Credited ${creditAmount} ${currency} to wallet`,
                currency,
                newBalance,
            });
        } catch (error) {
            next(error);
        }
    };

    // POST /api/payout/user/:userId/wallet/debit — deduct funds from a specific currency wallet
    debitWallet = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { currency, amount } = req.body;

            if (!currency || !amount) {
                return res.status(400).json({ success: false, message: "currency and amount are required" });
            }

            if (!SUPPORTED_CURRENCIES.includes(currency)) {
                return res.status(400).json({ success: false, message: `Unsupported currency: ${currency}` });
            }

            const debitAmount = parseFloat(amount);
            if (isNaN(debitAmount) || debitAmount <= 0) {
                return res.status(400).json({ success: false, message: "amount must be a positive number" });
            }

            const user = await PayoutUser.findByUserId(userId);
            if (!user) {
                return res.status(404).json({ success: false, message: "Payout user not found" });
            }

            const currentBalance = user.wallet.get(currency) || 0;

            // Make sure there's enough in the wallet before deducting
            if (currentBalance < debitAmount) {
                return res.status(400).json({
                    success:   false,
                    message:   `Insufficient ${currency} wallet balance`,
                    available: currentBalance,
                    requested: debitAmount,
                });
            }

            const newBalance = currentBalance - debitAmount;

            user.wallet.set(currency, newBalance);
            await user.save();

            logger.info("Wallet debited", { userId, currency, amount: debitAmount });

            res.json({
                success:    true,
                message:    `Debited ${debitAmount} ${currency} from wallet`,
                currency,
                newBalance,
            });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/payout/user/:userId/export — export transaction history as JSON or CSV
    // Use ?format=csv for CSV download, default is JSON.
    exportTransactions = async (req, res, next) => {
        try {
            const { userId } = req.params;
            const { format = "json", status, startDate, endDate } = req.query;

            const query = { userId };
            if (status) query.status = status;
            if (startDate || endDate) {
                query.createdAt = {};
                if (startDate) query.createdAt.$gte = new Date(startDate);
                if (endDate)   query.createdAt.$lte = new Date(endDate);
            }

            const transactions = await Transaction.find(query)
                .sort({ createdAt: -1 })
                .limit(5000) // Hard cap — don't let someone export millions of rows
                .select("transactionId userId amount currency status type createdAt metadata.description")
                .lean();

            if (format === "csv") {
                // Build a simple CSV — no external library needed for this structure
                const header = "transactionId,userId,amount,currency,status,type,description,createdAt";
                const rows = transactions.map((t) =>
                    [
                        t.transactionId,
                        t.userId,
                        t.amount,
                        t.currency,
                        t.status,
                        t.type || "payout",
                        (t.metadata?.description || "").replace(/,/g, " "), // strip commas from description
                        t.createdAt,
                    ].join(",")
                );

                res.setHeader("Content-Type", "text/csv");
                res.setHeader("Content-Disposition", `attachment; filename="transactions-${userId}.csv"`);
                return res.send([header, ...rows].join("\n"));
            }

            // Default: return JSON
            res.json({ success: true, count: transactions.length, transactions });
        } catch (error) {
            next(error);
        }
    };
}

export default PayoutController;
