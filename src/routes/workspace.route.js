// Workspace routes — all workspace management endpoints.
// All routes require authentication.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import * as ctrl from "../controllers/workspace.controller.js";
import {
    validate,
    createWorkspaceSchema,
    updateWorkspaceSchema,
    inviteMemberSchema,
    changeMemberRoleSchema,
} from "../validators/workspace.validate.js";

const router = express.Router();

router.use(isAuthenticated);

// Workspace CRUD
router.post("/",                                    validate(createWorkspaceSchema), ctrl.create);
router.get("/",                                     ctrl.list);
router.get("/:id",                                  ctrl.get);
router.put("/:id",                                  validate(updateWorkspaceSchema), ctrl.update);
router.delete("/:id",                               ctrl.remove);

// Members
router.post("/:id/invite",                          validate(inviteMemberSchema),    ctrl.invite);
router.get("/:id/members",                          ctrl.getMembers);
router.patch("/:id/members/:userId/role",           validate(changeMemberRoleSchema), ctrl.changeRole);
router.delete("/:id/members/:userId",               ctrl.removeMember);

// Stats
router.get("/:id/stats",                            ctrl.stats);

export default router;
