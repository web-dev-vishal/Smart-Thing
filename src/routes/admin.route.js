// Admin routes — platform management endpoints.
// Requires both authentication AND admin role.

import express from "express";
import { isAuthenticated, adminOnly } from "../middleware/auth.middleware.js";

const createAdminRouter = (adminController) => {
    const router = express.Router();

    // Every admin route needs a valid JWT AND admin role
    router.use(isAuthenticated, adminOnly);

    // System overview
    router.get("/stats",                                            adminController.getStats);

    // Transaction management
    router.get("/transactions",                                     adminController.getTransactions);

    // User management
    router.get("/users",                                            adminController.getUsers);
    router.get("/users/:userId",                                    adminController.getUserDetail);
    router.get("/users/:userId/transactions",                       adminController.getUserTransactions);
    router.patch("/users/:userId/status",                           adminController.updateUserStatus);
    router.post("/users/:userId/balance",                           adminController.adjustBalance);
    router.post("/users/:userId/spending-limits",                   adminController.setSpendingLimit);
    router.delete("/users/:userId/spending-limits/:period",         adminController.removeSpendingLimit);

    // Platform-wide views (admin only)
    router.get("/scheduled-payouts",                                adminController.getScheduledPayouts);
    router.get("/webhooks",                                         adminController.getAllWebhooks);

    // Audit and reporting
    router.get("/audit-logs",                                       adminController.getAuditLogs);
    router.get("/reports/volume",                                   adminController.getVolumeReport);
    router.get("/reports/currency",                                 adminController.getCurrencyReport);
    router.get("/reports/fraud",                                    adminController.getFraudReport);

    return router;
};

export default createAdminRouter;
