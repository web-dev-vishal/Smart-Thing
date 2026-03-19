import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisConnection from "../config/redis.js";

// Helper to create a Redis-backed store for a given key prefix.
// Using Redis means rate limit counters survive server restarts and work across multiple instances.
const makeStore = (prefix) =>
    new RedisStore({
        sendCommand: (...args) => redisConnection.getClient().call(...args),
        prefix:      `rl:${prefix}:`,
    });

// Factory to avoid repeating the same rateLimit config for every route
const createLimiter = (max, windowSec, prefix, message) =>
    rateLimit({
        windowMs:        windowSec * 1000,
        max,
        standardHeaders: true,  // Return rate limit info in the RateLimit-* headers
        legacyHeaders:   false,  // Don't send the old X-RateLimit-* headers
        message:         { success: false, message },
        store:           makeStore(prefix),
    });

// ─── Global ───────────────────────────────────────────────────────────────────
// Applied to every request — a broad safety net against abuse
export const globalLimiter = createLimiter(
    100, 15 * 60, "global",
    "Too many requests. Please try again later."
);

// ─── Auth routes ──────────────────────────────────────────────────────────────
// Tighter limits on sensitive auth endpoints to slow down brute force attempts

export const registerLimiter = createLimiter(
    5, 60 * 60, "register",
    "Too many registration attempts. Please try again after an hour."
);

export const loginLimiter = createLimiter(
    10, 15 * 60, "login",
    "Too many login attempts. Please try again after 15 minutes."
);

export const forgotPasswordLimiter = createLimiter(
    5, 60 * 60, "forgot-password",
    "Too many password reset requests. Please try again after an hour."
);

export const verifyOtpLimiter = createLimiter(
    5, 15 * 60, "verify-otp",
    "Too many OTP attempts. Please request a new OTP."
);

export const changePasswordLimiter = createLimiter(
    5, 60 * 60, "change-password",
    "Too many password change attempts. Please try again after an hour."
);

export const refreshTokenLimiter = createLimiter(
    20, 15 * 60, "refresh-token",
    "Too many token refresh attempts. Please try again after 15 minutes."
);

// ─── Payout ───────────────────────────────────────────────────────────────────

// Per-user payout limiter — keyed by userId so one user can't flood the queue.
// Falls back to IP if userId isn't in the body (shouldn't happen after validation).
export const payoutUserLimiter = (redisClient) =>
    rateLimit({
        windowMs:        60 * 1000, // 1 minute window
        max:             10,
        standardHeaders: true,
        legacyHeaders:   false,
        keyGenerator:    (req) => req.body?.userId || req.ip,
        store: new RedisStore({
            sendCommand: (...args) => redisClient.call(...args),
            prefix:      "rl:user:",
        }),
        message: {
            success: false,
            error:   "Too many payout requests for this user",
            code:    "USER_RATE_LIMIT_EXCEEDED",
        },
        handler: (_req, res) => {
            res.status(429).json({
                success: false,
                error:   "Too many payout requests. Please try again later.",
                code:    "USER_RATE_LIMIT_EXCEEDED",
            });
        },
    });
