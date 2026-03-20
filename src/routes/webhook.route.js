// Webhook routes — register and manage webhook endpoints.
// All routes require authentication.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import { validate } from "../validators/user.validate.js";
import { createWebhookSchema, updateWebhookSchema, webhookDeliveriesQuerySchema } from "../validators/webhook.validate.js";

const createWebhookRouter = (webhookController) => {
    const router = express.Router();

    // All webhook routes require a logged-in user
    router.use(isAuthenticated);

    router.post("/",                       validate(createWebhookSchema),                    webhookController.create);
    router.get("/",                        webhookController.list);
    router.patch("/:id",                   validate(updateWebhookSchema),                    webhookController.update);
    router.delete("/:id",                  webhookController.delete);
    router.get("/:id/deliveries",          validate(webhookDeliveriesQuerySchema, "query"),  webhookController.deliveries);
    router.post("/:id/test",               webhookController.test);

    return router;
};

export default createWebhookRouter;
