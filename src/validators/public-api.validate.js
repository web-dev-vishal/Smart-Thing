// Public API validators — Zod schemas for all the public proxy endpoints.
// Everything comes in as query params or route params (strings), so we coerce where needed.

import { z } from "zod";

// Reusable YYYY-MM-DD date string — used by several historical rate schemas
const dateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

// GET /api/public/convert?amount=100&from=USD&to=EUR
export const convertCurrencyQuerySchema = z.object({
    // Coerce from string; must be a positive number
    amount: z.coerce
        .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
        .positive("amount must be a positive number"),

    from: z
        .string({ required_error: "from currency is required" })
        .trim()
        .min(1, "from currency is required"),

    to: z
        .string({ required_error: "to currency is required" })
        .trim()
        .min(1, "to currency is required"),
});

// GET /api/public/rates/historical?date=2024-01-15&base=USD
export const historicalRatesQuerySchema = z.object({
    date: dateString.refine((v) => !isNaN(Date.parse(v)), { message: "date is not a valid calendar date" }),

    // base is optional — service defaults to USD if omitted
    base: z.string().trim().optional(),
});

// GET /api/public/rates/historical/range?start=2024-01-01&end=2024-01-31&base=USD
export const historicalRateRangeQuerySchema = z
    .object({
        start: dateString.refine((v) => !isNaN(Date.parse(v)), { message: "start is not a valid calendar date" }),
        end:   dateString.refine((v) => !isNaN(Date.parse(v)), { message: "end is not a valid calendar date" }),
        base:  z.string().trim().optional(),
    })
    .refine((data) => new Date(data.end) >= new Date(data.start), {
        message: "end date must be after start date",
        path: ["end"],
    })
    .refine(
        (data) => {
            const diffDays = (new Date(data.end) - new Date(data.start)) / (1000 * 60 * 60 * 24);
            return diffDays <= 365;
        },
        { message: "Date range cannot exceed 365 days", path: ["end"] },
    );

// GET /api/public/country/:code — 2-letter ISO country code
export const countryCodeParamSchema = z.object({
    code: z
        .string({ required_error: "country code is required" })
        .length(2, "country code must be exactly 2 letters (e.g. US, GB, IN)"),
});

// GET /api/public/crypto?coins=bitcoin,ethereum
// coins is an optional comma-separated list — max 10
export const cryptoPricesQuerySchema = z.object({
    coins: z
        .string()
        .optional()
        .transform((v) =>
            v ? v.split(",").map((c) => c.trim().toLowerCase()) : ["bitcoin", "ethereum", "tether", "usd-coin"]
        )
        .refine((arr) => arr.length <= 10, { message: "Maximum 10 coins per request" }),
});

// GET /api/public/crypto/convert?amount=500&coin=bitcoin
export const convertToCryptoQuerySchema = z.object({
    amount: z.coerce
        .number({ required_error: "amount (in USD) is required", invalid_type_error: "amount must be a number" })
        .positive("amount must be a positive number"),

    // coin defaults to bitcoin in the service if omitted
    coin: z.string().trim().optional(),
});

// GET /api/public/bin/:bin — at least 6 digits
export const cardBinParamSchema = z.object({
    bin: z
        .string({ required_error: "BIN is required" })
        // Strip non-digits then check length — same logic the controller was doing manually
        .transform((v) => v.replace(/\D/g, ""))
        .refine((v) => v.length >= 6, { message: "BIN must be at least 6 digits" }),
});

// GET /api/public/postcode/:country/:postcode
export const postcodeParamSchema = z.object({
    country: z
        .string({ required_error: "country code is required" })
        .length(2, "country code must be exactly 2 letters (e.g. US, GB, DE)"),

    postcode: z
        .string({ required_error: "postcode is required" })
        .min(1, "postcode is required"),
});
