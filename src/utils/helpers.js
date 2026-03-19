import crypto from "crypto";

export const generateTransactionId = () => {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString("hex");
    return `TXN_${timestamp}_${random}`.toUpperCase();
};

export const roundAmount = (amount) => Math.round(amount * 100) / 100;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1) {
                await sleep(baseDelay * Math.pow(2, attempt));
            }
        }
    }
    throw lastError;
};

export const calculateDuration = (startTime) => Date.now() - startTime.getTime();

export const getClientIP = (req) =>
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    req.ip ||
    "127.0.0.1";

export const sanitizeForLogging = (obj) => {
    const sensitive = ["password", "token", "secret", "apikey", "authorization"];
    return Object.fromEntries(
        Object.entries(obj).map(([k, v]) =>
            sensitive.some((s) => k.toLowerCase().includes(s)) ? [k, "[REDACTED]"] : [k, v]
        )
    );
};
