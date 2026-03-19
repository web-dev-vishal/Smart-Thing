import logger from "../utils/logger.js";

const CACHE_TTL = 24 * 60 * 60; // 24 hours

class IPValidator {
    constructor(redisClient) {
        this.redis = redisClient;
        this.enabled = process.env.ENABLE_IP_VALIDATION === "true";
    }

    async validateIP(ipAddress, userCountry) {
        if (!this.enabled) {
            return { valid: true, country: null, suspicious: false, cached: false };
        }

        if (!ipAddress || ipAddress === "::1" || ipAddress === "127.0.0.1") {
            return { valid: true, country: "localhost", suspicious: false, cached: false };
        }

        try {
            const cacheKey = `cache:ip:${ipAddress}`;
            const cached = await this.redis.get(cacheKey);

            if (cached) {
                const data = JSON.parse(cached);
                return {
                    valid:      true,
                    country:    data.country,
                    city:       data.city,
                    suspicious: !!(userCountry && data.country !== userCountry),
                    cached:     true,
                };
            }

            await this._incrementCounter("ipapi");

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 2000);

            const response = await fetch(`https://ipapi.co/${ipAddress}/json/`, {
                headers: { "User-Agent": "SwiftPay/1.0" },
                signal: controller.signal,
            });

            clearTimeout(timeout);

            if (!response.ok) throw new Error(`ipapi error: ${response.status}`);

            const data = await response.json();
            if (data.error) throw new Error(data.reason || "IP lookup failed");

            const result = {
                country: data.country_code || "Unknown",
                city:    data.city,
                region:  data.region,
            };

            await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

            return {
                valid:      true,
                country:    result.country,
                city:       result.city,
                region:     result.region,
                suspicious: !!(userCountry && result.country !== userCountry),
                cached:     false,
            };
        } catch (error) {
            if (error.name === "AbortError") {
                logger.warn("IP validation timed out", { ipAddress });
            } else {
                logger.error("IP validation failed", { ipAddress, error: error.message });
            }

            // Fail open — don't block payouts on IP lookup failures
            return { valid: true, country: null, suspicious: false, cached: false, error: error.message };
        }
    }

    async _incrementCounter(service) {
        try {
            const today = new Date().toISOString().split("T")[0];
            const key = `cache:api_count:${service}:${today}`;
            const count = await this.redis.incr(key);
            await this.redis.expire(key, 86400);

            const limit = this._getLimit(service);
            if (count >= limit * 0.9) {
                logger.warn(`API usage near limit for ${service}`, {
                    count,
                    limit,
                    pct: Math.round((count / limit) * 100),
                });
            }
        } catch {
            // Non-critical — don't fail the request
        }
    }

    _getLimit(service) {
        return { ipapi: 1000, exchangerate: 1500, groq: 14400 }[service] ?? 1000;
    }

    async getAPIUsage(service) {
        try {
            const today = new Date().toISOString().split("T")[0];
            const count = parseInt(await this.redis.get(`cache:api_count:${service}:${today}`)) || 0;
            const limit = this._getLimit(service);
            return { service, count, limit, percentage: Math.round((count / limit) * 100) };
        } catch {
            return { service, count: 0, limit: this._getLimit(service), percentage: 0 };
        }
    }
}

export default IPValidator;
