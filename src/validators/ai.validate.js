// AI endpoint validators — Zod schemas for the currency and IP validation query params.
// These are GET endpoints so everything comes in via req.query (strings).

import { z } from "zod";

// GET /api/ai/validate/currency?currency=EUR&amount=100
// currency is required; amount is optional but must be a positive number if given
export const validateCurrencyQuerySchema = z.object({
    currency: z
        .string({ required_error: "currency is required" })
        .trim()
        .min(1, "currency is required"),

    // Coerce from string since query params are always strings
    // If omitted, we just skip the USD conversion
    amount: z.coerce
        .number({ invalid_type_error: "amount must be a number" })
        .positive("amount must be a positive number")
        .optional(),
});

// GET /api/ai/validate/ip?ip=1.2.3.4
// Just the IP address — the service handles format validation internally
export const validateIPQuerySchema = z.object({
    ip: z
        .string({ required_error: "ip is required" })
        .trim()
        .min(1, "ip is required"),
});
