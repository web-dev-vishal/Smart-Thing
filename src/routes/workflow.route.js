// Workflow routes — all workflow automation endpoints.
// All routes require authentication.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import * as ctrl from "../controllers/workflow.controller.js";
import { validate, createWorkflowSchema, updateWorkflowSchema, triggerWorkflowSchema } from "../validators/workflow.validate.js";

const router = express.Router({ mergeParams: true }); // inherit :workspaceId

router.use(isAuthenticated);

// Workflow CRUD
router.post("/",                                            validate(createWorkflowSchema),  ctrl.create);
router.get("/",                                             ctrl.list);
router.get("/:workflowId",                                  ctrl.get);
router.put("/:workflowId",                                  validate(updateWorkflowSchema),  ctrl.update);
router.delete("/:workflowId",                               ctrl.remove);

// Enable / disable
router.post("/:workflowId/enable",                          ctrl.enable);
router.post("/:workflowId/disable",                         ctrl.disable);

// Manual trigger
router.post("/:workflowId/trigger",                         validate(triggerWorkflowSchema), ctrl.trigger);

// Execution history
router.get("/:workflowId/executions",                       ctrl.getExecutions);
router.get("/:workflowId/executions/:executionId",          ctrl.getExecution);
router.post("/:workflowId/executions/:executionId/retry",   ctrl.retryExecution);

export default router;
