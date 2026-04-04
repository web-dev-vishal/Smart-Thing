// DM routes — direct message endpoints nested under workspaces.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import * as ctrl from "../controllers/dm.controller.js";
import { validate, startDMSchema, sendMessageSchema } from "../validators/workspace.validate.js";

const router = express.Router({ mergeParams: true }); // inherit :workspaceId

router.use(isAuthenticated);

router.post("/",                        validate(startDMSchema),      ctrl.startDM);
router.get("/",                         ctrl.list);
router.get("/:dmId",                    ctrl.get);
router.delete("/:dmId",                 ctrl.close);
router.get("/:dmId/members",            ctrl.getMembers);
router.post("/:dmId/messages",          validate(sendMessageSchema),  ctrl.sendMessage);
router.get("/:dmId/messages",           ctrl.getMessages);

export default router;
