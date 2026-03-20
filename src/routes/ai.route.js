// AI routes — utility endpoints plus the multi-agent AI system.
// The agent endpoints (assess, investigate, insights) are the new additions
// inspired by github.com/Shubhamsaboo/awesome-llm-apps patterns.

import express from "express";
import { isAuthenticated, adminOnly } from "../middleware/auth.middleware.js";

const createAIRouter = (aiController, aiAgentController) => {
    const router = express.Router();

    // ── Utility endpoints (no auth required) ─────────────────────────────────
    router.get("/usage",             aiController.getAPIUsage);
    router.get("/currencies",        aiController.getSupportedCurrencies);
    router.get("/validate/currency", aiController.validateCurrency);
    router.get("/validate/ip",       aiController.validateIP);

    // ── Multi-agent AI endpoints (auth required) ──────────────────────────────

    // POST /api/ai/assess/:transactionId
    // Full multi-agent risk assessment — fraud score + anomaly + supervisor verdict
    router.post("/assess/:transactionId", isAuthenticated, aiAgentController.assessRisk);

    // POST /api/ai/investigate/:transactionId
    // Start or continue a fraud investigation conversation (admin only)
    router.post("/investigate/:transactionId", isAuthenticated, adminOnly, aiAgentController.investigate);

    // DELETE /api/ai/investigate/session/:sessionId
    // Close an investigation session
    router.delete("/investigate/session/:sessionId", isAuthenticated, adminOnly, aiAgentController.closeInvestigation);

    // GET /api/ai/insights/:userId
    // Financial coach — personalized spending pattern analysis
    router.get("/insights/:userId", isAuthenticated, aiAgentController.getInsights);

    return router;
};

export default createAIRouter;
