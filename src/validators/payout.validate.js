import { z } from "zod";

const SUPPORTED_CURRENCIES = [
    "USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF",
    "CNY", "MXN", "BRL", "ZAR", "SGD", "HKD", "NZD", "SEK",
    "NOK", "DKK", "PLN", "THB", "KRW", "RUB", "TRY", "IDR",
    "MYR", "PHP", "VND", "AED", "SAR", "EGP",
];

export const payoutSchema = z.object({
    userId: z
        .string({ required_error: "userId is required" })
        .min(3, "userId must be at least 3 characters")
        .max(50, "userId must be at most 50 characters")
        .regex(/^[a-zA-Z0-9_-]+$/, "userId may only contain letters, numbers, hyphens, and underscores"),

    amount: z
        .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
        .positive("amount must be positive")
        .min(0.01, "minimum amount is 0.01")
        .max(1_000_000, "maximum amount is 1,000,000"),

    currency: z
        .string()
        .toUpperCase()
        .refine((v) => SUPPORTED_CURRENCIES.includes(v), {
            message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        })
        .default("USD"),

    description: z
        .string()
        .max(500, "description must be at most 500 characters")
        .optional(),
});

export const validatePayout = (req, res, next) => {
    const result = payoutSchema.safeParse(req.body);

    if (!result.success) {
        const errors = result.error.errors.map((e) => e.message);
        return res.status(400).json({ success: false, errors });
    }

    req.body = result.data;
    next();
};
