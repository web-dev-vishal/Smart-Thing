// Webhook Controller — handles HTTP requests for webhook management.
// Users can register URLs to receive payout event notifications.

class WebhookController {
    constructor(webhookService) {
        this.webhookService = webhookService;
    }

    // POST /api/webhooks — register a new webhook endpoint
    create = async (req, res, next) => {
        try {
            const userId = req.userId;
            const { url, events } = req.body;

            const webhook = await this.webhookService.createWebhook(userId, { url, events });

            res.status(201).json({
                success: true,
                message: "Webhook created. Save the secret — it won't be shown again.",
                webhook,
            });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/webhooks — list all webhooks for the current user
    list = async (req, res, next) => {
        try {
            const webhooks = await this.webhookService.getUserWebhooks(req.userId);
            res.json({ success: true, webhooks });
        } catch (error) {
            next(error);
        }
    };

    // PATCH /api/webhooks/:id — update a webhook's URL, events, or active status
    update = async (req, res, next) => {
        try {
            const webhook = await this.webhookService.updateWebhook(
                req.params.id,
                req.userId,
                req.body
            );
            res.json({ success: true, webhook });
        } catch (error) {
            next(error);
        }
    };

    // DELETE /api/webhooks/:id — remove a webhook
    delete = async (req, res, next) => {
        try {
            await this.webhookService.deleteWebhook(req.params.id, req.userId);
            res.json({ success: true, message: "Webhook deleted" });
        } catch (error) {
            next(error);
        }
    };

    // GET /api/webhooks/:id/deliveries — view delivery history for a webhook
    deliveries = async (req, res, next) => {
        try {
            const limit = req.query.limit;
            const logs = await this.webhookService.getDeliveryLogs(
                req.params.id,
                req.userId,
                limit
            );
            res.json({ success: true, deliveries: logs });
        } catch (error) {
            next(error);
        }
    };
    // POST /api/webhooks/:id/test — send a test event to verify the endpoint works
    test = async (req, res, next) => {
        try {
            const result = await this.webhookService.testWebhook(req.params.id, req.userId);
            res.json({ success: true, ...result });
        } catch (error) {
            next(error);
        }
    };
}

export default WebhookController;
