// Channel routes — all channel management endpoints.
// All routes require authentication.

import express from "express";
import { isAuthenticated } from "../middleware/auth.middleware.js";
import * as ctrl from "../controllers/channel.controller.js";
import * as msgCtrl from "../controllers/message.controller.js";
import {
    validate,
    createChannelSchema,
    updateChannelSchema,
    sendMessageSchema,
    editMessageSchema,
    reactionSchema,
} from "../validators/workspace.validate.js";

const router = express.Router({ mergeParams: true }); // inherit :workspaceId from parent

router.use(isAuthenticated);

// Channel CRUD
router.post("/",                                    validate(createChannelSchema),   ctrl.create);
router.get("/",                                     ctrl.list);
router.get("/:channelId",                           ctrl.get);
router.put("/:channelId",                           validate(updateChannelSchema),   ctrl.update);
router.delete("/:channelId",                        ctrl.remove);

// Membership
router.post("/:channelId/join",                     ctrl.join);
router.post("/:channelId/leave",                    ctrl.leave);

// Pins
router.post("/:channelId/pin/:messageId",           ctrl.pin);
router.delete("/:channelId/pin/:messageId",         ctrl.unpin);

// Search within channel
router.get("/:channelId/search",                    ctrl.search);

// Messages within channel
router.post("/:channelId/messages",                 validate(sendMessageSchema),     msgCtrl.send);
router.get("/:channelId/messages",                  msgCtrl.list);
router.get("/:channelId/messages/:messageId",       msgCtrl.get);
router.put("/:channelId/messages/:messageId",       validate(editMessageSchema),     msgCtrl.edit);
router.delete("/:channelId/messages/:messageId",    msgCtrl.remove);

// Reactions
router.post("/:channelId/messages/:messageId/react",    validate(reactionSchema),   msgCtrl.react);
router.delete("/:channelId/messages/:messageId/react",  validate(reactionSchema),   msgCtrl.unreact);

// Threads
router.post("/:channelId/messages/:messageId/thread",   validate(sendMessageSchema), msgCtrl.replyInThread);
router.get("/:channelId/messages/:messageId/thread",    msgCtrl.getThread);

export default router;
