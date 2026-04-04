// Workflow validators — Zod schemas for workflow CRUD and execution endpoints.

import { z } from "zod";

// Reuse the validate helper from user.validate.js pattern
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

// Individual workflow node
const nodeSchema = z.object({
    id:   z.string().min(1),
    type: z.enum(["ai_agent", "send_message", "send_email", "http_request", "condition", "delay"]),
    name: z.string().min(1).max(100),
    config: z.record(z.unknown()).default({}),
    nextId:        z.string().nullable().optional(),
    trueBranchId:  z.string().optional(),
    falseBranchId: z.string().optional(),
});

// Trigger definition
const triggerSchema = z.object({
    type:   z.enum(["message_keyword", "schedule", "webhook", "manual"]),
    config: z.record(z.unknown()).default({}),
});

export const createWorkflowSchema = z.object({
    name:        z.string().min(1).max(100),
    description: z.string().max(500).optional().default(""),
    trigger:     triggerSchema,
    nodes:       z.array(nodeSchema).default([]),
    isEnabled:   z.boolean().optional().default(true),
});

export const updateWorkflowSchema = z.object({
    name:        z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    trigger:     triggerSchema.optional(),
    nodes:       z.array(nodeSchema).optional(),
    isEnabled:   z.boolean().optional(),
});

export const triggerWorkflowSchema = z.object({
    payload: z.record(z.unknown()).optional().default({}),
});
