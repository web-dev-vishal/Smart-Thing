// Spending Limit Controller — lets users set and manage their own payout caps.
// Example: "don't let me spend more than $500 per day".

class SpendingLimitController {
    constructor(spendingLimitService) {
        this.spendingLimitService = spendingLimitService;
    }

    // GET /api/spending-limits — get all limits with current usage
    list = async (req, res, next) => {
        try {
            const limits = await this.spendingLimitService.getLimitsWithUsage(req.user.id);
            res.json({ success: true, limits });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/spending-limits/usage — get current spend totals for all active periods
    // Useful when you want just the numbers without the full limit config
    getUsage = async (req, res, next) => {
        try {
            const userId = req.user.id;

            // Calculate usage for all three periods in parallel
            const [daily, weekly, monthly] = await Promise.all([
                this.spendingLimitService.getCurrentUsage(userId, "daily"),
                this.spendingLimitService.getCurrentUsage(userId, "weekly"),
                this.spendingLimitService.getCurrentUsage(userId, "monthly"),
            ]);

            res.json({
                success: true,
                usage: {
                    daily,
                    weekly,
                    monthly,
                },
            });
        } catch (error) {
            next(error);
        }
    };

    // POST /api/spending-limits — create or update a spending limit
    set = async (req, res, next) => {
        try {
            const { period, limitAmount, currency } = req.body;

            const limit = await this.spendingLimitService.setLimit(req.user.id, {
                period,
                limitAmount,
                currency,
                setBy: "user",
            });

            res.json({ success: true, message: "Spending limit saved", limit });
        } catch (error) {
            next(error);
        }
    };

    // DELETE /api/spending-limits/:period — remove a spending limit
    delete = async (req, res, next) => {
        try {
            const { period } = req.params;
            await this.spendingLimitService.deleteLimit(req.user.id, period);
            res.json({ success: true, message: `${period} spending limit removed` });
        } catch (error) {
            next(error);
        }
    };
}

export default SpendingLimitController;
