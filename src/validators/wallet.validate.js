// Wallet validators — shared Zod schema for both credit and debit operations.
// Both endpoints require the same fields, so one schema covers both.

import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "../utils/constants.js";

// Wallet operation — used for both POST /wallet/credit and POST /wallet/debit
export const walletOperationSchema = z.object({
    // Uppercased automatically so "usd" and "USD" both work; must be a supported code
    currency: z
        .string({ required_error: "currency is required" })
        .toUpperCase()
        .refine((v) => SUPPORTED_CURRENCIES.includes(v), {
            message: `currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`,
        }),

    // Must be a positive number — zero or negative amounts make no sense for a wallet op
    amount: z
        .number({ required_error: "amount is required", invalid_type_error: "amount must be a number" })
        .positive("amount must be greater than 0"),
});
