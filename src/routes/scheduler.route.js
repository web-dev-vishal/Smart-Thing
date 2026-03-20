// Scheduler routes — create and manage scheduled payouts.
// All routes require authentication.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import { validate } from "../validators/user.validate.js";
import { createScheduledPayoutSchema, updateScheduledPayoutSchema, listScheduledPayoutsQuerySchema } from "../validators/scheduler.validate.js";

const createSchedulerRouter = (schedulerController) => {
    const router = express.Router();

    router.use(isAuthenticated);

    router.post("/",        validate(createScheduledPayoutSchema),                schedulerController.create);
    router.get("/",         validate(listScheduledPayoutsQuerySchema, "query"),   schedulerController.list);
    router.get("/:id",      schedulerController.get);
    router.patch("/:id",    validate(updateScheduledPayoutSchema),                schedulerController.update);
    router.delete("/:id",   schedulerController.cancel);

    return router;
};

export default createSchedulerRouter;
