import logger from "../utils/logger.js";

class BalanceService {
    constructor(redisClient) {
        this.redis = redisClient;
    }

    _key(userId) {
        return `balance:${userId}`;
    }

    async getBalance(userId) {
        const raw = await this.redis.get(this._key(userId));
        return raw === null ? null : parseFloat(raw);
    }

    async syncBalance(userId, balance) {
        await this.redis.set(this._key(userId), balance.toString());
        logger.debug("Balance synced to Redis", { userId, balance });
    }

    async hasSufficientBalance(userId, amount) {
        const balance = await this.getBalance(userId);
        return balance !== null && balance >= amount;
    }

    async deductBalance(userId, amount) {
        // Lua script runs atomically in Redis — no race condition between read and write
        const lua = `
            local current = redis.call("get", KEYS[1])
            if not current then return nil end
            current = tonumber(current)
            local amt = tonumber(ARGV[1])
            if current < amt then return -1 end
            local newBal = current - amt
            redis.call("set", KEYS[1], tostring(newBal))
            return newBal
        `;

        const result = await this.redis.eval(lua, 1, this._key(userId), amount.toString());

        if (result === null) throw new Error("BALANCE_NOT_FOUND");
        if (result === -1)   throw new Error("INSUFFICIENT_BALANCE");

        logger.debug("Balance deducted", { userId, amount, newBalance: result });
        return parseFloat(result);
    }

    async addBalance(userId, amount) {
        // Same atomic pattern as deductBalance — keeps the balance consistent
        const lua = `
            local current = redis.call("get", KEYS[1])
            if not current then return nil end
            local newBal = tonumber(current) + tonumber(ARGV[1])
            redis.call("set", KEYS[1], tostring(newBal))
            return newBal
        `;

        const result = await this.redis.eval(lua, 1, this._key(userId), amount.toString());

        if (result === null) throw new Error("BALANCE_NOT_FOUND");

        logger.debug("Balance added", { userId, amount, newBalance: result });
        return parseFloat(result);
    }

    async deleteBalance(userId) {
        await this.redis.del(this._key(userId));
    }
}

export default BalanceService;
