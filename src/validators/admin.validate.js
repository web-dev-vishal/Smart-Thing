// Admin validators — Zod schemas for admin-only mutation and query endpoints.
// Keeps controllers thin by catching bad inputs before they reach the service layer.

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../utils/constants.js";

// Update user status — only the three recognised status values are allowed
export const updateUserStatusSchema = z.object({
    status: z.enum(["active", "suspended", "banned"], {
        required_error: "status is required",
        invalid_type_error: "status must be one of: active, suspended, banned",
    }),
});

// Adjust balance — amount must be non-zero, type and reason are required
export const adjustBalanceSchema = z.object({
    // Non-zero: positive for credit, negative for debit — zero is meaningless
    amount: z
        .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
        .refine((v) => v !== 0, { message: "amount must be non-zero" }),

    // Explicit direction so the intent is unambiguous regardless of amount sign
    type: z.enum(["credit", "debit"], {
        required_error: "type is required",
        invalid_type_error: "type must be one of: credit, debit",
    }),

    // Audit trail — must be a non-empty string, capped at 500 chars
    reason: z
        .string({ required_error: "reason is required" })
        .min(1, "reason must not be empty")
        .max(500, "reason must be at most 500 characters"),
});

// Admin set spending limit — same shape as the user-facing version
export const adminSetSpendingLimitSchema = z.object({
    // Must be one of the three supported billing periods
    period: z.enum(["daily", "weekly", "monthly"], {
        required_error: "period is required",
        invalid_type_error: "period must be one of: daily, weekly, monthly",
    }),

    // Must be a positive number — zero or negative makes no sense as a limit
    limitAmount: z
        .number({ required_error: "limitAmount is required", invalid_type_error: "limitAmount must be a number" })
        .positive("limitAmount must be greater than 0"),

    // Uppercased automatically; defaults to USD if omitted
    currency: z
        .string()
        .toUpperCase()
        .refine((v) => SUPPORTED_CURRENCIES.includes(v), {
            message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        })
        .default("USD"),
});

// Pagination query — used for GET /admin/transactions and GET /admin/users
export const paginationQuerySchema = z.object({
    // Coerce from string since query params arrive as strings
    page: z.coerce
        .number()
        .int("page must be an integer")
        .positive("page must be at least 1")
        .default(1),

    // Capped at 200 for admin endpoints — higher than user-facing limits
    limit: z.coerce
        .number()
        .int("limit must be an integer")
        .positive("limit must be at least 1")
        .max(200, "limit must be at most 200")
        .default(50),
});

// Volume report query — controls how many days of data to aggregate
export const volumeReportQuerySchema = z.object({
    // Coerce from string; 1–365 days, defaults to the last 30 days
    days: z.coerce
        .number()
        .int("days must be an integer")
        .min(1, "days must be at least 1")
        .max(365, "days must be at most 365")
        .default(30),
});
