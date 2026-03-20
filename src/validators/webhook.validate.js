// Webhook validators — Zod schemas for webhook create, update, and query requests.
// Ensures URLs are valid and event types are known before hitting the service layer.

import { z } from "zod";
import { WEBHOOK_EVENTS } from "../utils/constants.js";

// Create webhook — url is required, events defaults to all supported event types
export const createWebhookSchema = z.object({
    // Must be a fully-qualified URL — rejects bare strings like "example.com"
    url: z.string({ required_error: "url is required" }).url("url must be a valid URL"),

    // Events must be a non-empty array of known lifecycle event strings.
    // Defaults to all events so callers can omit it to subscribe to everything.
    events: z
        .array(z.enum(WEBHOOK_EVENTS, { errorMap: () => ({ message: `events must contain only valid webhook event types: ${WEBHOOK_EVENTS.join(", ")}` }) }))
        .min(1, "events must contain at least one event type")
        .default([...WEBHOOK_EVENTS]),
});

// Update webhook — all fields optional, but at least one must be present
export const updateWebhookSchema = z.object({
    // Optional new URL — same validation as create
    url: z.string().url("url must be a valid URL").optional(),

    // Optional new event list — still must be non-empty if provided
    events: z
        .array(z.enum(WEBHOOK_EVENTS, { errorMap: () => ({ message: `events must contain only valid webhook event types: ${WEBHOOK_EVENTS.join(", ")}` }) }))
        .min(1, "events must contain at least one event type")
        .optional(),

    // Toggle the webhook on or off
    active: z.boolean({ invalid_type_error: "active must be a boolean" }).optional(),
}).refine((data) => data.url !== undefined || data.events !== undefined || data.active !== undefined, {
    message: "Provide at least one field to update (url, events, or active)",
});

// Deliveries query — coerce limit from string (query params are always strings)
export const webhookDeliveriesQuerySchema = z.object({
    // Coerce from string since query params arrive as strings; cap at 100
    limit: z.coerce
        .number()
        .int("limit must be an integer")
        .min(1, "limit must be at least 1")
        .max(100, "limit must be at most 100")
        .default(20),
});
