// Notification routes — in-app notification inbox.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import * as ctrl from "../controllers/notification.controller.js";

const router = express.Router();

router.use(isAuthenticated);

router.get("/",                                         ctrl.list);
router.post("/mark-read",                               ctrl.markRead);
router.delete("/:id",                                   ctrl.remove);

// Workspace-scoped notification preferences
router.get("/preferences/:workspaceId",                 ctrl.getPreferences);
router.put("/preferences/:workspaceId",                 ctrl.updatePreferences);

export default router;
