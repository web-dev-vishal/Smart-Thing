// WorkspaceMember — the join table between users and workspaces.
// Tracks role, join date, notification preferences, and online status.
// One user can be a member of multiple workspaces with different roles in each.

import mongoose from "mongoose";

const ROLES = ["owner", "admin", "member", "guest"];

const workspaceMemberSchema = new mongoose.Schema(
    {
        workspaceId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "Workspace",
            required: true,
            index:    true,
        },
        userId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "User",
            required: true,
            index:    true,
        },
        role: {
            type:    String,
            enum:    ROLES,
            default: "member",
        },
        // Display name override — member can have a different name per workspace
        displayName: {
            type: String,
            trim: true,
        },
        // Notification preferences for this workspace
        notifications: {
            allMessages:  { type: Boolean, default: false },
            mentions:     { type: Boolean, default: true  },
            directMessages: { type: Boolean, default: true },
            email:        { type: Boolean, default: true  },
        },
        // Last time this member was seen active in this workspace
        lastSeenAt: {
            type:    Date,
            default: Date.now,
        },
        // Whether this member has been deactivated (soft delete)
        isActive: {
            type:    Boolean,
            default: true,
        },
        // Invite tracking
        invitedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  "User",
        },
        joinedAt: {
            type:    Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// A user can only be a member of a workspace once
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
workspaceMemberSchema.index({ userId: 1, isActive: 1 });

const WorkspaceMember = mongoose.model("WorkspaceMember", workspaceMemberSchema);
export default WorkspaceMember;
