// User input validators — Zod schemas for all auth-related request bodies.
// Each schema is used with the validate() middleware factory below.
// Zod automatically trims strings, lowercases emails, and gives clear error messages.

import { z } from "zod";

// ─── Schemas ─────────────────────────────────────────────────────────────────

// Registration — username, email, and password
export const registerSchema = z.object({
    username: z
        .string({ required_error: "Username is required" })
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(30, "Username must be at most 30 characters")
        // Only letters, numbers, and underscores — no spaces or special chars
        .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
    email: z
        .string({ required_error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Please provide a valid email"),
    password: z
        .string({ required_error: "Password is required" })
        .min(6, "Password must be at least 6 characters")
        .max(64, "Password must be at most 64 characters"),
});

// Login — just email and password
export const loginSchema = z.object({
    email: z
        .string({ required_error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Please provide a valid email"),
    password: z
        .string({ required_error: "Password is required" })
        .min(1, "Password is required"),
});

// Forgot password — just the email address to send the OTP to
export const forgotPasswordSchema = z.object({
    email: z
        .string({ required_error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Please provide a valid email"),
});

// OTP verification — must be exactly 6 digits
export const verifyOtpSchema = z.object({
    otp: z
        .string({ required_error: "OTP is required" })
        .length(6, "OTP must be exactly 6 digits")
        .regex(/^\d{6}$/, "OTP must contain only digits"),
});

// Change password — new password + confirmation, must match
export const changePasswordSchema = z.object({
    newPassword: z
        .string({ required_error: "New password is required" })
        .min(6, "Password must be at least 6 characters")
        .max(64, "Password must be at most 64 characters"),
    confirmPassword: z
        .string({ required_error: "Confirm password is required" })
        .min(1, "Confirm password is required"),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

// ─── Middleware factory ───────────────────────────────────────────────────────

// Returns an Express middleware that validates req[source] against the given schema.
// source defaults to "body" so all existing call sites keep working unchanged.
// On failure: returns 400 with all validation error messages.
// On success: replaces req[source] with the parsed (coerced + trimmed) data and calls next().
export const validate = (schema, source = "body") => (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
        const errors = result.error.errors.map((e) => e.message);
        return res.status(400).json({ success: false, errors });
    }
    // Use the parsed data — Zod has already trimmed strings, lowercased emails, etc.
    req[source] = result.data;
    next();
};

// Profile update — both fields are optional, but at least one must be provided
export const updateProfileSchema = z.object({
    username: z
        .string()
        .trim()
        .min(3, "Username must be at least 3 characters")
        .max(30, "Username must be at most 30 characters")
        // Same rules as registration — letters, numbers, underscores only
        .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores")
        .optional(),
    email: z
        .string()
        .trim()
        .toLowerCase()
        .email("Please provide a valid email")
        .optional(),
}).refine((data) => data.username !== undefined || data.email !== undefined, {
    message: "Provide at least username or email to update",
});

// Resend verification — just the email address to resend the link to
export const resendVerificationSchema = z.object({
    email: z
        .string({ required_error: "Email is required" })
        .trim()
        .toLowerCase()
        .email("Please provide a valid email"),
});
