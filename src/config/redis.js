import Redis from "ioredis";
import logger from "../utils/logger.js";

class RedisConnection {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.client = new Redis({
                host:                 process.env.REDIS_HOST || "localhost",
                port:                 parseInt(process.env.REDIS_PORT) || 6379,
                password:             process.env.REDIS_PASSWORD || undefined,
                // Retry with increasing delay, capped at 2 seconds
                retryStrategy:        (times) => Math.min(times * 50, 2000),
                maxRetriesPerRequest: 3,
                enableReadyCheck:     true,
                connectTimeout:       10000,
                lazyConnect:          false,
            });

            // "ready" fires after the connection is established and Redis responds to PING
            this.client.on("ready", () => {
                this.isConnected = true;
                logger.info("Redis connected", {
                    host: process.env.REDIS_HOST,
                    port: process.env.REDIS_PORT,
                });
                resolve(this.client);
            });

            this.client.on("error", (err) => {
                this.isConnected = false;
                logger.error("Redis error:", err.message);
                // Only reject the promise on the very first connection failure.
                // After that, ioredis handles reconnection internally.
                if (!this.isConnected) reject(err);
            });

            this.client.on("close", () => {
                this.isConnected = false;
                logger.warn("Redis connection closed");
            });

            this.client.on("reconnecting", () => {
                logger.info("Redis reconnecting...");
            });
        });
    }

    async disconnect() {
        if (this.client) {
            // quit() sends QUIT to Redis and waits for acknowledgment — cleaner than destroy()
            await this.client.quit();
            this.isConnected = false;
            logger.info("Redis disconnected gracefully");
        }
    }

    getClient() {
        if (!this.client) throw new Error("Redis client not initialized — call connect() first");
        return this.client;
    }

    async isHealthy() {
        try {
            if (!this.client) return false;
            const pong = await this.client.ping();
            return pong === "PONG" && this.isConnected;
        } catch {
            return false;
        }
    }
}

export default new RedisConnection();
