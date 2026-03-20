// Payout user validators — Zod schemas for payout user profile management,
// transaction history queries, and export queries.

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../utils/constants.js";

// Create payout user — userId is required, everything else is optional
export const createPayoutUserSchema = z.object({
    // Alphanumeric with hyphens/underscores — same rules as the core payout schema
    userId: z
        .string({ required_error: "userId is required" })
        .min(3, "userId must be at least 3 characters")
        .max(50, "userId must be at most 50 characters")
        .regex(/^[a-zA-Z0-9_-]+$/, "userId may only contain letters, numbers, hyphens, and underscores"),

    // Optional contact email — validated if provided
    email: z.string().trim().toLowerCase().email("Please provide a valid email").optional(),

    // Uppercased automatically; defaults to USD if omitted
    currency: z
        .string()
        .toUpperCase()
        .refine((v) => SUPPORTED_CURRENCIES.includes(v), {
            message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        })
        .default("USD"),

    // Starting balance — must be zero or positive, never negative
    initialBalance: z
        .number({ invalid_type_error: "initialBalance must be a number" })
        .nonnegative("initialBalance must be 0 or greater")
        .optional(),

    // Country and phone are free-form strings — no strict format enforced here
    country: z.string().optional(),
    phone: z.string().optional(),
});

// Update payout user — all fields optional, but at least one must be present
export const updatePayoutUserSchema = z.object({
    // Uppercased automatically; must be a supported code if provided
    currency: z
        .string()
        .toUpperCase()
        .refine((v) => SUPPORTED_CURRENCIES.includes(v), {
            message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        })
        .optional(),

    // ISO 3166-1 alpha-2 — exactly 2 letters (e.g. "US", "GB")
    country: z
        .string()
        .length(2, "country must be a 2-letter ISO code")
        .optional(),

    // Optional email update — validated if provided
    email: z.string().trim().toLowerCase().email("Please provide a valid email").optional(),

    // Phone is free-form — format varies too much by region to enforce strictly
    phone: z.string().optional(),
}).refine(
    (data) => data.currency !== undefined || data.country !== undefined || data.email !== undefined || data.phone !== undefined,
    { message: "Provide at least one field to update (currency, country, email, or phone)" },
);

// Transaction history query — coerce limit from string, optional status filter
export const transactionHistoryQuerySchema = z.object({
    // Coerce from string since query params arrive as strings; cap at 200
    limit: z.coerce
        .number()
        .int("limit must be an integer")
        .positive("limit must be at least 1")
        .max(200, "limit must be at most 200")
        .default(50),

    // Optional filter — only the four known transaction states are accepted
    status: z
        .enum(["initiated", "processing", "completed", "failed"], {
            invalid_type_error: "status must be one of: initiated, processing, completed, failed",
        })
        .optional(),
});

// Export query — format, status filter, and optional date range
export const exportQuerySchema = z
    .object({
        // Output format — defaults to JSON if omitted
        format: z.enum(["json", "csv"]).default("json"),

        // Optional status filter — same four states as history
        status: z
            .enum(["initiated", "processing", "completed", "failed"], {
                invalid_type_error: "status must be one of: initiated, processing, completed, failed",
            })
            .optional(),

        // ISO 8601 datetime strings — validated if provided
        startDate: z.string().datetime({ message: "startDate must be a valid ISO 8601 date-time string" }).optional(),
        endDate: z.string().datetime({ message: "endDate must be a valid ISO 8601 date-time string" }).optional(),
    })
    .refine(
        (data) => {
            // Only check the range when both dates are present
            if (data.startDate && data.endDate) {
                return new Date(data.startDate) <= new Date(data.endDate);
            }
            return true;
        },
        { message: "startDate must be before or equal to endDate" },
    );
