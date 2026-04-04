// Admin Controller — endpoints for admin users to manage the platform.
// All routes here require the admin middleware (checked in the router).

class AdminController {
    constructor(adminService) {
        this.adminService = adminService;
    }

    // GET /api/admin/stats — system-wide overview
    getStats = async (req, res, next) => {
        try {
            const stats = await this.adminService.getSystemStats();
            res.json({ success: true, stats });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/transactions — search/filter all transactions
    getTransactions = async (req, res, next) => {
        try {
            const result = await this.adminService.getTransactions(req.query);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/users — list all payout users
    getUsers = async (req, res, next) => {
        try {
            const result = await this.adminService.getUsers(req.query);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/users/:userId — full profile for one user
    getUserDetail = async (req, res, next) => {
        try {
            const result = await this.adminService.getUserDetail(req.params.userId);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/users/:userId/transactions — paginated transaction history for one user
    getUserTransactions = async (req, res, next) => {
        try {
            const result = await this.adminService.getUserTransactions(req.params.userId, req.query);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // PATCH /api/admin/users/:userId/status — suspend or reactivate a user
    updateUserStatus = async (req, res, next) => {
        try {
            const { status } = req.body;

            const user = await this.adminService.updateUserStatus(
                req.params.userId,
                status,
                req.userId
            );

            res.json({ success: true, message: "User status updated", user });
        } catch (error) {
            next(error);
        }
    };

    // POST /api/admin/users/:userId/balance — manually adjust a user's balance
    adjustBalance = async (req, res, next) => {
        try {
            const { amount, type, reason } = req.body;

            const result = await this.adminService.adjustBalance(req.params.userId, {
                amount,
                type,
                reason,
                adminId: req.userId,
            });

            res.json({ success: true, message: "Balance adjusted", ...result });
        } catch (error) {
            next(error);
        }
    };

    // POST /api/admin/users/:userId/spending-limits — impose a spending limit on a user
    setSpendingLimit = async (req, res, next) => {
        try {
            const { period, limitAmount, currency } = req.body;

            const limit = await this.adminService.setUserSpendingLimit(
                req.params.userId,
                { period, limitAmount, currency },
                req.userId
            );

            res.json({ success: true, message: "Spending limit set", limit });
        } catch (error) {
            next(error);
        }
    };

    // DELETE /api/admin/users/:userId/spending-limits/:period — remove a specific spending limit
    removeSpendingLimit = async (req, res, next) => {
        try {
            const { userId, period } = req.params;

            const result = await this.adminService.removeUserSpendingLimit(userId, period, req.userId);

            res.json({ success: true, message: `${period} spending limit removed`, result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/audit-logs — search audit logs
    getAuditLogs = async (req, res, next) => {
        try {
            const result = await this.adminService.getAuditLogs(req.query);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/reports/volume — daily volume report
    getVolumeReport = async (req, res, next) => {
        try {
            const days = req.query.days;
            const report = await this.adminService.getVolumeReport(days);
            res.json({ success: true, days, report });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/reports/currency — breakdown of volume by currency
    getCurrencyReport = async (req, res, next) => {
        try {
            const report = await this.adminService.getCurrencyReport();
            res.json({ success: true, report });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/reports/fraud — fraud score distribution report
    getFraudReport = async (req, res, next) => {
        try {
            const report = await this.adminService.getFraudReport();
            res.json({ success: true, report });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/scheduled-payouts — view all scheduled payouts across all users
    getScheduledPayouts = async (req, res, next) => {
        try {
            const result = await this.adminService.getScheduledPayouts(req.query);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/admin/webhooks — view all webhooks across all users
    getAllWebhooks = async (req, res, next) => {
        try {
            const result = await this.adminService.getAllWebhooks(req.query);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };
}

export default AdminController;
