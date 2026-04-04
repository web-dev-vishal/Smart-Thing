// Workspace — the top-level container for everything in NexusFlow.
// Think of it like a Slack organization: one company = one workspace.
// All channels, messages, workflows, and members live inside a workspace.
// Data is fully isolated between workspaces at the query level.

import mongoose from "mongoose";

const workspaceSchema = new mongoose.Schema(
    {
        name: {
            type:      String,
            required:  [true, "Workspace name is required"],
            trim:      true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [50, "Name must be under 50 characters"],
        },
        slug: {
            // URL-friendly identifier — e.g. "acme-corp"
            // Generated from name on creation, must be unique
            type:      String,
            required:  true,
            unique:    true,
            lowercase: true,
            trim:      true,
            match:     [/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"],
        },
        description: {
            type:    String,
            default: "",
            maxlength: [200, "Description must be under 200 characters"],
        },
        icon: {
            // Emoji or URL to workspace icon
            type:    String,
            default: "🚀",
        },
        ownerId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      "User",
            required: true,
            index:    true,
        },
        // AI token budget — how many tokens this workspace can use per month
        // null means unlimited (for dev/testing)
        aiTokenBudget: {
            type:    Number,
            default: 100000,
        },
        aiTokensUsed: {
            type:    Number,
            default: 0,
        },
        // Which AI models this workspace prefers (can be overridden per workflow)
        aiSettings: {
            primaryModel:    { type: String, default: "groq/llama-3.3-70b" },
            fallbackModel:   { type: String, default: "openrouter/deepseek-v3" },
            enabledFeatures: {
                smartReplies:    { type: Boolean, default: true },
                autoSummarize:   { type: Boolean, default: true },
                sentimentAlerts: { type: Boolean, default: false },
            },
        },
        // Security settings
        settings: {
            requireEmailVerification: { type: Boolean, default: true },
            allowGuestAccess:         { type: Boolean, default: false },
            messageRetentionDays:     { type: Number,  default: 365 },
            maxMembersCount:          { type: Number,  default: 100 },
        },
        isActive: {
            type:    Boolean,
            default: true,
        },
        memberCount: {
            // Denormalized for quick display — updated on member add/remove
            type:    Number,
            default: 1,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for fast member lookups
workspaceSchema.index({ ownerId: 1, isActive: 1 });
// Note: slug unique index is already defined via unique:true on the field above

// Generate a URL-safe slug from the workspace name
workspaceSchema.statics.generateSlug = function(name) {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 40);
};

const Workspace = mongoose.model("Workspace", workspaceSchema);
export default Workspace;
