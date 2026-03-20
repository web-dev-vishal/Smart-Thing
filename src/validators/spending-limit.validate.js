// Spending limit validators — Zod schemas for setting and managing spending limits.
// Validates period enums, positive amounts, and supported currencies.

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../utils/constants.js";

// Set spending limit — period and limitAmount are required, currency defaults to USD
export const setSpendingLimitSchema = z.object({
    // Must be one of the three supported billing periods
    period: z.enum(["daily", "weekly", "monthly"], {
        required_error: "period is required",
        invalid_type_error: "period must be one of: daily, weekly, monthly",
    }),

    // Must be a positive number — zero or negative makes no sense as a limit
    limitAmount: z
        .number({ required_error: "limitAmount is required", invalid_type_error: "limitAmount must be a number" })
        .positive("limitAmount must be greater than 0"),

    // Uppercased automatically so "usd" and "USD" both work; must be a supported code
    currency: z
        .string()
        .toUpperCase()
        .refine((v) => SUPPORTED_CURRENCIES.includes(v), {
            message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        })
        .default("USD"),
});

// Period param — validates the :period URL segment on DELETE /spending-limits/:period
export const spendingLimitPeriodParamSchema = z.object({
    // Rejects any value that isn't a recognised period — returns 400 before the controller runs
    period: z.enum(["daily", "weekly", "monthly"], {
        required_error: "period is required",
        invalid_type_error: "period must be one of: daily, weekly, monthly",
    }),
});
