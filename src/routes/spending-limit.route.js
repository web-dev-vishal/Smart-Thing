// Spending limit routes — set and manage payout caps.
// All routes require authentication.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import { validate } from "../validators/user.validate.js";
import { setSpendingLimitSchema, spendingLimitPeriodParamSchema } from "../validators/spending-limit.validate.js";

const createSpendingLimitRouter = (spendingLimitController) => {
    const router = express.Router();

    router.use(isAuthenticated);

    router.get("/",                        spendingLimitController.list);
    router.get("/usage",                   spendingLimitController.getUsage);
    router.post("/",                       validate(setSpendingLimitSchema),                       spendingLimitController.set);
    router.delete("/:period",              validate(spendingLimitPeriodParamSchema, "params"),      spendingLimitController.delete);

    return router;
};

export default createSpendingLimitRouter;
