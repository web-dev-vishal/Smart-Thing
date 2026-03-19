import "dotenv/config";

import database from "../config/database.js";
import redisConnection from "../config/redis.js";
import rabbitmq from "../config/rabbitmq.js";

import DistributedLock from "../services/distributed-lock.service.js";
import BalanceService from "../services/balance.service.js";
import MessageConsumer from "../services/message-consumer.service.js";
import GroqClient from "../services/groq.service.js";

import Transaction from "../models/transaction.model.js";
import PayoutUser from "../models/payout-user.model.js";
import AuditLog from "../models/audit-log.model.js";

import logger from "../utils/logger.js";
import { calculateDuration } from "../utils/helpers.js";

class WorkerService {
    constructor() {
        this.redis    = null;
        this.balance  = null;
        this.lock     = null;
        this.consumer = null;
        this.groq     = null;
        this.stopping = false;
    }

    async initialize() {
        logger.info("Starting worker service...");

        await database.connect();

        await redisConnection.connect();
        this.redis = redisConnection.getClient();

        await rabbitmq.connect();

        this.balance = new BalanceService(this.redis);
        this.lock    = new DistributedLock(this.redis);
        this.groq    = new GroqClient();

        logger.info("Worker service initialized");
    }

    async processMessage(payload) {
        const startTime = new Date();
        const { transactionId, userId, amount, currency, lockValue } = payload;

        let transaction = null;

        try {
            transaction = await Transaction.findByTransactionId(transactionId);

            if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");

            // Idempotency guard — if the message was delivered twice, skip it
            if (transaction.status === "completed") {
                logger.warn("Transaction already completed — skipping", { transactionId });
                return;
            }

            if (transaction.status === "processing") {
                throw new Error("ALREADY_PROCESSING");
            }

            await transaction.markAsProcessing();
            await AuditLog.logAction(transactionId, userId, "PAYOUT_PROCESSING", { status: "processing" });
            await this._publishWsEvent(userId, "PAYOUT_PROCESSING", { transactionId, amount, currency });

            // Re-check balance in Redis before deducting — the lock ensures no one else is here
            const currentBalance = await this.balance.getBalance(userId);
            if (currentBalance === null) throw new Error("BALANCE_NOT_FOUND");
            if (currentBalance < amount)  throw new Error("INSUFFICIENT_BALANCE");

            // Atomic deduction via Lua script — safe against concurrent writes
            const newBalance = await this.balance.deductBalance(userId, amount);

            await AuditLog.logAction(transactionId, userId, "BALANCE_DEDUCTED", {
                previousBalance: currentBalance,
                newBalance,
                amount,
            });

            transaction.balanceAfter = newBalance;
            await transaction.markAsCompleted();

            // Sync the new balance back to MongoDB so it survives a Redis flush
            await PayoutUser.updateOne(
                { userId },
                {
                    $set:          { balance: newBalance },
                    $inc:          { "metadata.totalPayouts": 1, "metadata.totalPayoutAmount": amount },
                    $currentDate:  { "metadata.lastPayoutAt": true },
                }
            );

            // Release the distributed lock
            if (lockValue) {
                await this.lock.release(userId, lockValue);
            } else {
                await this.redis.del(`lock:${userId}`);
            }

            await AuditLog.logAction(transactionId, userId, "LOCK_RELEASED", { success: true });

            await this._publishWsEvent(userId, "PAYOUT_COMPLETED", { transactionId, amount, currency, newBalance });

            await AuditLog.logAction(transactionId, userId, "PAYOUT_COMPLETED", {
                amount,
                newBalance,
                processingTimeMs: calculateDuration(startTime),
            });

            // Post-completion anomaly detection (non-blocking)
            this._detectAnomaly(transaction, userId).catch((err) =>
                logger.error("Anomaly detection error:", err.message)
            );

            logger.info("Payout processed successfully", {
                transactionId,
                userId,
                amount,
                processingTimeMs: calculateDuration(startTime),
            });
        } catch (error) {
            logger.error("Payout processing failed", {
                transactionId,
                userId,
                error:            error.message,
                processingTimeMs: calculateDuration(startTime),
            });

            // Roll back balance for unexpected errors (not for logic errors like insufficient funds)
            const nonRollbackErrors = new Set(["TRANSACTION_NOT_FOUND", "ALREADY_PROCESSING", "INSUFFICIENT_BALANCE"]);
            if (!nonRollbackErrors.has(error.message)) {
                try {
                    await this.balance.addBalance(userId, amount);
                    await AuditLog.logAction(transactionId, userId, "BALANCE_RESTORED", { amount, reason: "error_rollback" });
                    logger.info("Balance rolled back", { transactionId, amount });
                } catch (rollbackErr) {
                    logger.error("Balance rollback failed", { transactionId, error: rollbackErr.message });
                }
            }

            if (transaction) await transaction.markAsFailed(error);

            await this._publishWsEvent(userId, "PAYOUT_FAILED", { transactionId, amount, currency, error: error.message });
            await AuditLog.logAction(transactionId, userId, "PAYOUT_FAILED", {
                error:            error.message,
                processingTimeMs: calculateDuration(startTime),
            });

            throw error;
        }
    }

    async _publishWsEvent(userId, event, data) {
        try {
            await this.redis.publish(
                "websocket:events",
                JSON.stringify({ userId, event, data, timestamp: new Date().toISOString() })
            );
        } catch (error) {
            logger.error("Failed to publish WebSocket event", { userId, event, error: error.message });
        }
    }

    async _detectAnomaly(transaction, userId) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const history = await Transaction.find({
            userId,
            status:    "completed",
            createdAt: { $gte: thirtyDaysAgo },
            _id:       { $ne: transaction._id },
        })
            .select("amount currency createdAt")
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();

        if (history.length === 0) return;

        const result = await this.groq.detectAnomaly(
            { amount: transaction.amount, currency: transaction.currency, createdAt: transaction.createdAt },
            history
        );

        if (result.isAnomaly) {
            await AuditLog.logAction(transaction.transactionId, userId, "ANOMALY_DETECTED", {
                confidence:   result.confidence,
                explanation:  result.explanation,
                aiAvailable:  result.aiAvailable,
                historyCount: history.length,
            });

            logger.warn("Transaction anomaly detected", {
                transactionId: transaction.transactionId,
                userId,
                confidence:    result.confidence,
            });
        }
    }

    async start() {
        this.consumer = new MessageConsumer(
            rabbitmq.getChannel(),
            this.processMessage.bind(this)
        );

        await this.consumer.startConsuming("payout_queue");

        logger.info("Worker consuming from payout_queue", {
            concurrency: parseInt(process.env.WORKER_CONCURRENCY) || 5,
        });
    }

    async shutdown() {
        if (this.stopping) return;
        this.stopping = true;

        logger.info("Worker shutting down...");

        if (this.consumer) await this.consumer.stopConsuming();

        // Allow in-flight messages to finish
        await new Promise((r) => setTimeout(r, 5000));

        await rabbitmq.disconnect();
        await redisConnection.disconnect();
        await database.disconnect();

        logger.info("Worker shutdown complete");
        process.exit(0);
    }
}

const worker = new WorkerService();

(async () => {
    try {
        await worker.initialize();
        await worker.start();
    } catch (error) {
        logger.error("Worker failed to start:", error.message);
        process.exit(1);
    }
})();

process.on("SIGTERM", () => worker.shutdown());
process.on("SIGINT",  () => worker.shutdown());

process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception in worker:", error);
    worker.shutdown();
});

process.on("unhandledRejection", (reason) => {
    logger.error("Unhandled rejection in worker:", reason);
    worker.shutdown();
});
