// Workspace validators — Zod schemas for workspace and channel endpoints.

import { z } from "zod";

export const validate = (schema, source = "body") => (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors:  result.error.errors.map(e => ({ field: e.path.join("."), message: e.message })),
        });
    }
    req[source] = result.data;
    next();
};

export const createWorkspaceSchema = z.object({
    name:        z.string().min(2).max(50),
    description: z.string().max(200).optional().default(""),
    icon:        z.string().max(10).optional().default("🚀"),
});

export const updateWorkspaceSchema = z.object({
    name:        z.string().min(2).max(50).optional(),
    description: z.string().max(200).optional(),
    icon:        z.string().max(10).optional(),
});

export const inviteMemberSchema = z.object({
    email: z.string().email(),
    role:  z.enum(["admin", "member", "guest"]).optional().default("member"),
});

export const changeMemberRoleSchema = z.object({
    role: z.enum(["admin", "member", "guest"]),
});

export const createChannelSchema = z.object({
    name:        z.string().min(1).max(80).regex(/^[a-z0-9-_]+$/, "Channel name can only contain lowercase letters, numbers, hyphens, and underscores"),
    description: z.string().max(250).optional().default(""),
    type:        z.enum(["public", "private"]).optional().default("public"),
});

export const updateChannelSchema = z.object({
    name:        z.string().min(1).max(80).optional(),
    description: z.string().max(250).optional(),
    topic:       z.string().max(250).optional(),
});

export const sendMessageSchema = z.object({
    content:  z.string().min(1).max(10000),
    parentId: z.string().optional(),
});

export const editMessageSchema = z.object({
    content: z.string().min(1).max(10000),
});

export const reactionSchema = z.object({
    emoji: z.string().min(1).max(10),
});

export const startDMSchema = z.object({
    participantIds: z.array(z.string()).min(1).max(7),
});
