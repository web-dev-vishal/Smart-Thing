import crypto from "crypto";
import logger from "../utils/logger.js";

class DistributedLock {
    constructor(redisClient) {
        this.redis = redisClient;
    }

    async acquire(resource, ttlMs = 30000) {
        const lockKey = `lock:${resource}`;
        const lockValue = crypto.randomBytes(16).toString("hex");

        const result = await this.redis.set(lockKey, lockValue, "PX", ttlMs, "NX");

        if (result === "OK") {
            logger.debug("Lock acquired", { resource, ttlMs });
            return lockValue;
        }

        logger.warn("Lock already held", { resource });
        return null;
    }

    async release(resource, lockValue) {
        const lockKey = `lock:${resource}`;

        // Lua script ensures we only delete the key if we're the one who set it.
        // Without this check, a slow process could release a lock that another process acquired.
        const lua = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;

        const result = await this.redis.eval(lua, 1, lockKey, lockValue);

        if (result === 1) {
            logger.debug("Lock released", { resource });
            return true;
        }

        logger.warn("Lock release failed — not owner or already expired", { resource });
        return false;
    }

    async acquireWithRetry(resource, ttlMs = 30000, maxRetries = 3, retryDelayMs = 100) {
        // Try a few times with increasing delay before giving up.
        // This handles brief lock contention without hammering Redis.
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const lockValue = await this.acquire(resource, ttlMs);
            if (lockValue) return lockValue;

            if (attempt < maxRetries) {
                await new Promise((r) => setTimeout(r, retryDelayMs * attempt));
            }
        }

        logger.warn("Failed to acquire lock after retries", { resource, maxRetries });
        return null;
    }
}

export default DistributedLock;
