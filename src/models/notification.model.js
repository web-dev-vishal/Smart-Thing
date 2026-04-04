// Notification — in-app notifications for users.
// Created when someone mentions you, sends you a DM, or a workflow completes.
// Delivered in real-time via Socket.IO and stored here for the notification inbox.

import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        userId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "User",
            required: true,
            index:    true,
        },
        workspaceId: {
            type:  mongoose.Schema.Types.ObjectId,
            ref:   "Workspace",
            index: true,
        },
        type: {
            type:    String,
            enum:    [
                "mention",           // someone @mentioned you
                "dm",                // new direct message
                "channel_invite",    // invited to a private channel
                "workspace_invite",  // invited to a workspace
                "workflow_complete", // a workflow you triggered finished
                "workflow_failed",   // a workflow failed
                "reaction",          // someone reacted to your message
                "thread_reply",      // someone replied in a thread you're in
            ],
            required: true,
        },
        // Human-readable notification text
        title:   { type: String, required: true },
        body:    { type: String, default: "" },
        // Deep link — where to navigate when the notification is clicked
        link:    { type: String, default: "" },
        // The entity that triggered this notification
        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        },
        // Reference to the relevant entity (message, workflow, etc.)
        entityId:   { type: mongoose.Schema.Types.ObjectId },
        entityType: { type: String },
        isRead: {
            type:    Boolean,
            default: false,
            index:   true,
        },
        readAt: { type: Date },
    },
    {
        timestamps: true,
    }
);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);
export default Notification;
