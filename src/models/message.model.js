// Message — the core content unit of NexusFlow.
// Messages live in channels or DM conversations.
// Supports threads (replies), reactions, edits, and soft deletes.
// Indexed heavily for fast pagination and search.

import mongoose from "mongoose";

const reactionSchema = new mongoose.Schema(
    {
        emoji:   { type: String, required: true },
        userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        count:   { type: Number, default: 0 },
    },
    { _id: false }
);

const messageSchema = new mongoose.Schema(
    {
        workspaceId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Workspace",
            required: true,
            index:    true,
        },
        channelId: {
            // null for DM messages
            type:  mongoose.Schema.Types.ObjectId,
            ref:   "Channel",
            index: true,
        },
        dmId: {
            // null for channel messages
            type:  mongoose.Schema.Types.ObjectId,
            ref:   "DirectMessage",
            index: true,
        },
        // Thread support — if this is a reply, parentId points to the root message
        parentId: {
            type:  mongoose.Schema.Types.ObjectId,
            ref:   "Message",
            index: true,
        },
        threadCount: {
            // How many replies this message has (only set on root messages)
            type:    Number,
            default: 0,
        },
        senderId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "User",
            required: true,
            index:    true,
        },
        // The actual message text — supports markdown
        content: {
            type:      String,
            required:  [true, "Message content is required"],
            maxlength: [10000, "Message must be under 10,000 characters"],
        },
        // Mentions extracted from content — @userId references
        mentions: [{
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        }],
        // Emoji reactions — { emoji: "👍", userIds: [...], count: 3 }
        reactions: [reactionSchema],
        // Edit history — we keep the last 5 edits
        editHistory: [{
            content:  String,
            editedAt: { type: Date, default: Date.now },
        }],
        isEdited: {
            type:    Boolean,
            default: false,
        },
        // Soft delete — we keep the record but hide the content
        isDeleted: {
            type:    Boolean,
            default: false,
            index:   true,
        },
        deletedAt: {
            type: Date,
        },
        // Bookmarks — which users have bookmarked this message
        bookmarkedBy: [{
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        }],
        // AI-generated metadata (populated asynchronously after message is saved)
        aiMetadata: {
            sentiment:    String,   // "positive" | "negative" | "neutral"
            smartReplies: [String], // suggested reply options
            summary:      String,   // for long messages
        },
        // Forwarded from another message
        forwardedFrom: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  "Message",
        },
    },
    {
        timestamps: true,
    }
);

// Primary query pattern: get messages in a channel, newest first, paginated
messageSchema.index({ channelId: 1, createdAt: -1 });
messageSchema.index({ dmId: 1, createdAt: -1 });
messageSchema.index({ parentId: 1, createdAt: 1 });
messageSchema.index({ workspaceId: 1, senderId: 1 });
// Text search index for the global search feature
messageSchema.index({ content: "text" });

const Message = mongoose.model("Message", messageSchema);
export default Message;
