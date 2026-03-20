// AI Agent Controller — HTTP endpoints for the multi-agent AI system.
// These endpoints expose the fraud investigation, risk assessment,
// and financial coaching agents to authenticated users and admins.

import crypto from "crypto";

class AIAgentController {
    constructor(aiAgentService) {
        this.aiAgentService = aiAgentService;
    }

    // POST /api/ai/assess/:transactionId
    // Run a full multi-agent risk assessment on a transaction.
    // Returns fraud score, anomaly detection result, and supervisor verdict.
    assessRisk = async (req, res, next) => {
        try {
            const result = await this.aiAgentService.assessTransactionRisk(req.params.transactionId);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // POST /api/ai/investigate/:transactionId
    // Start or continue a fraud investigation conversation.
    // Body: { message: "Why did this transaction come from a different country?" }
    // Body (optional): { sessionId: "existing-session-id" } to continue a conversation
    investigate = async (req, res, next) => {
        try {
            const { message, sessionId } = req.body;

            if (!message || message.trim().length === 0) {
                return res.status(400).json({ success: false, message: "message is required" });
            }

            // Generate a new session ID if this is the first message
            const session = sessionId || `inv_${crypto.randomBytes(8).toString("hex")}`;

            const result = await this.aiAgentService.investigateTransaction(
                req.params.transactionId,
                message.trim(),
                session
            );

            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // DELETE /api/ai/investigate/session/:sessionId
    // End an investigation session and free the memory.
    closeInvestigation = async (req, res, next) => {
        try {
            this.aiAgentService.closeInvestigation(req.params.sessionId);
            res.json({ success: true, message: "Investigation session closed" });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/ai/insights/:userId
    // Get personalized financial insights for a user.
    // The financial coach agent analyzes their transaction history.
    getInsights = async (req, res, next) => {
        try {
            const result = await this.aiAgentService.getFinancialInsights(req.params.userId);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };
}

export default AIAgentController;
