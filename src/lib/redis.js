// Thin wrapper around the shared Redis connection.
// The actual connection lifecycle (connect/disconnect/health) lives in src/config/redis.js.
// This file just exports key helpers and a convenience accessor used by auth services.
import redisConnection from "../config/redis.js";

// ─── Key factories ────────────────────────────────────────────────────────────
// Centralizing key names here means we never have typos scattered across files.
export const keys = {
    otp:          (email)  => `otp:${email}`,
    refreshToken: (userId) => `refresh_token:${userId}`,
    verifyToken:  (userId) => `verify_token:${userId}`,
    userCache:    (userId) => `user:${userId}`,
};

// ─── TTLs (in seconds) ────────────────────────────────────────────────────────
export const TTL = {
    OTP:        10 * 60,           // 10 minutes — OTPs expire quickly
    REFRESH:    30 * 24 * 60 * 60, // 30 days — matches JWT refresh token lifetime
    VERIFY:     10 * 60,           // 10 minutes — email verification links are short-lived
    USER_CACHE: 60 * 60,           // 1 hour — cached user profile
};

// Returns the live Redis client.
// We use a getter function instead of capturing the client at import time
// because the connection might not be established yet when this module loads.
export const getRedis = () => redisConnection.getClient();
