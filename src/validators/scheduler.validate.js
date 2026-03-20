// Scheduler validators — Zod schemas for scheduled payout create, update, and list requests.
// Ensures amounts are positive, dates are in the future, and currencies are supported.

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../utils/constants.js";

// Create scheduled payout — amount and scheduledAt are required
export const createScheduledPayoutSchema = z.object({
    // Must be a positive number — zero or negative amounts are not valid payouts
    amount: z
        .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
        .positive("amount must be greater than 0"),

    // ISO 8601 datetime string that must resolve to a future point in time
    scheduledAt: z
        .string({ required_error: "scheduledAt is required" })
        .datetime({ message: "scheduledAt must be a valid ISO 8601 date-time string" })
        .refine((val) => new Date(val) > new Date(), {
            message: "scheduledAt must be a future date/time",
        }),

    // Uppercased automatically; defaults to USD if omitted
    currency: z
        .string()
        .toUpperCase()
        .refine((v) => SUPPORTED_CURRENCIES.includes(v), {
            message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        })
        .default("USD"),

    // Optional note — capped at 500 chars to keep it reasonable
    description: z
        .string()
        .max(500, "description must be at most 500 characters")
        .optional(),
});

// Update scheduled payout — all fields optional, but at least one must be present
export const updateScheduledPayoutSchema = z.object({
    // Same positive-number rule as create
    amount: z
        .number({ invalid_type_error: "amount must be a number" })
        .positive("amount must be greater than 0")
        .optional(),

    // Same future-datetime rule as create
    scheduledAt: z
        .string()
        .datetime({ message: "scheduledAt must be a valid ISO 8601 date-time string" })
        .refine((val) => new Date(val) > new Date(), {
            message: "scheduledAt must be a future date/time",
        })
        .optional(),

    // Optional description update — same 500-char cap
    description: z
        .string()
        .max(500, "description must be at most 500 characters")
        .optional(),
}).refine((data) => data.amount !== undefined || data.scheduledAt !== undefined || data.description !== undefined, {
    message: "Provide at least one field to update (amount, scheduledAt, or description)",
});

// List scheduled payouts query — coerce page and limit from query string
export const listScheduledPayoutsQuerySchema = z.object({
    // Coerce from string; must be a positive integer
    page: z.coerce
        .number()
        .int("page must be an integer")
        .positive("page must be at least 1")
        .default(1),

    // Coerce from string; capped at 100 to prevent large result sets
    limit: z.coerce
        .number()
        .int("limit must be an integer")
        .positive("limit must be at least 1")
        .max(100, "limit must be at most 100")
        .default(20),
});
