// DirectMessage — a private conversation between 2 or more users.
// Can be a 1:1 DM or a group DM (up to 8 people).
// Messages in DMs use the Message model with dmId set.

import mongoose from "mongoose";

const directMessageSchema = new mongoose.Schema(
    {
        workspaceId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Workspace",
            required: true,
            index:    true,
        },
        // All participants — sorted by userId for consistent deduplication
        participants: [{
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        }],
        // Last message preview for the DM list
        lastMessageAt: {
            type: Date,
        },
        lastMessagePreview: {
            type:    String,
            default: "",
        },
        messageCount: {
            type:    Number,
            default: 0,
        },
        // Track which participants have "closed" this DM from their sidebar
        // (doesn't delete messages — just hides the conversation)
        closedBy: [{
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        }],
        isGroup: {
            // true if more than 2 participants
            type:    Boolean,
            default: false,
        },
        groupName: {
            // Only used for group DMs
            type: String,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

// Find existing DM between a set of users (sorted participant IDs = canonical form)
directMessageSchema.index({ workspaceId: 1, participants: 1 });

const DirectMessage = mongoose.model("DirectMessage", directMessageSchema);
export default DirectMessage;
