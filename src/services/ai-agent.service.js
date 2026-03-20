// AI Agent Service — orchestrates the multi-agent system for HTTP endpoints.
// This sits between the controller and the GroqClient, pulling the data
// each agent needs from MongoDB before calling the AI.

import Transaction from "../models/transaction.model.js";
import PayoutUser from "../models/payout-user.model.js";
import AuditLog from "../models/audit-log.model.js";
import SpendingLimit from "../models/spending-limit.model.js";
import logger from "../utils/logger.js";

class AIAgentService {
    constructor(groqClient) {
        this.groq = groqClient;
    }

    // Run a full multi-agent risk assessment on a transaction.
    // Fetches the user's recent history from MongoDB, then passes it to the agents.
    async assessTransactionRisk(transactionId) {
        const transaction = await Transaction.findOne({ transactionId }).lean();
        if (!transaction) {
            throw { statusCode: 404, message: "Transaction not found" };
        }

        // Get the last 20 completed transactions for RAG context
        const history = await Transaction.find({
            userId: transaction.userId,
            status: "completed",
            _id:    { $ne: transaction._id },
        })
            .sort({ createdAt: -1 })
            .limit(20)
            .select("amount currency status createdAt")
            .lean();

        const user = await PayoutUser.findByUserId(transaction.userId);

        const result = await this.groq.runMultiAgentRiskAssessment(
            {
                userId:           transaction.userId,
                amount:           transaction.amount,
                currency:         transaction.currency,
                ipCountry:        transaction.metadata?.ipCountry,
                userCountry:      user?.country || "US",
                transactionCount: await Transaction.countDocuments({ userId: transaction.userId }),
            },
            history
        );

        return { transactionId, userId: transaction.userId, assessment: result };
    }

    // Start or continue a fraud investigation conversation about a transaction.
    // The agent remembers the full conversation history across turns.
    async investigateTransaction(transactionId, message, sessionId) {
        const transaction = await Transaction.findOne({ transactionId }).lean();
        if (!transaction) {
            throw { statusCode: 404, message: "Transaction not found" };
        }

        // Fetch audit logs to give the agent full context about what happened
        const auditLogs = await AuditLog.find({ transactionId })
            .sort({ timestamp: 1 })
            .lean();

        const context = {
            transaction,
            auditLogs: auditLogs.map((l) => ({ action: l.action, details: l.details, timestamp: l.timestamp })),
        };

        const result = await this.groq.investigateTransaction(sessionId, message, context);

        return { transactionId, sessionId, ...result };
    }

    // End an investigation session
    closeInvestigation(sessionId) {
        this.groq.clearInvestigationSession(sessionId);
    }

    // Get personalized financial insights for a user.
    // Fetches their full transaction history and spending limits, then asks the coach agent.
    async getFinancialInsights(userId) {
        const [transactions, spendingLimits] = await Promise.all([
            Transaction.find({ userId, status: "completed" })
                .sort({ createdAt: -1 })
                .limit(100)
                .select("amount currency status createdAt")
                .lean(),
            SpendingLimit.find({ userId, active: true }).lean(),
        ]);

        const result = await this.groq.analyzeSpendingPatterns(userId, transactions, spendingLimits);

        return { userId, ...result };
    }
}

export default AIAgentService;
