// Channel — a named conversation space inside a workspace.
// Can be public (anyone in the workspace can join) or private (invite only).
// Direct messages use a separate DM model, not channels.

import mongoose from "mongoose";

const channelSchema = new mongoose.Schema(
    {
        workspaceId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Workspace",
            required: true,
            index:    true,
        },
        name: {
            type:      String,
            required:  [true, "Channel name is required"],
            trim:      true,
            lowercase: true,
            minlength: [1, "Channel name must be at least 1 character"],
            maxlength: [80, "Channel name must be under 80 characters"],
            // Channel names follow Slack convention: lowercase, no spaces
            match:     [/^[a-z0-9-_]+$/, "Channel name can only contain lowercase letters, numbers, hyphens, and underscores"],
        },
        description: {
            type:    String,
            default: "",
            maxlength: [250, "Description must be under 250 characters"],
        },
        type: {
            type:    String,
            enum:    ["public", "private"],
            default: "public",
        },
        createdBy: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "User",
            required: true,
        },
        // Members list — only tracked for private channels
        // Public channels: all workspace members can see and join
        members: [{
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        }],
        // Pinned messages — stored as message IDs
        pinnedMessages: [{
            messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
            pinnedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            pinnedAt:  { type: Date, default: Date.now },
        }],
        // Topic — short status line shown at the top of the channel
        topic: {
            type:    String,
            default: "",
            maxlength: [250, "Topic must be under 250 characters"],
        },
        // Message count — denormalized for analytics
        messageCount: {
            type:    Number,
            default: 0,
        },
        // Last message preview — for channel list display
        lastMessageAt: {
            type: Date,
        },
        lastMessagePreview: {
            type:    String,
            default: "",
        },
        isArchived: {
            type:    Boolean,
            default: false,
        },
        isDefault: {
            // Default channels (like #general) can't be deleted and all members auto-join
            type:    Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

// Channel names must be unique within a workspace
channelSchema.index({ workspaceId: 1, name: 1 }, { unique: true });
channelSchema.index({ workspaceId: 1, isArchived: 1 });

const Channel = mongoose.model("Channel", channelSchema);
export default Channel;
