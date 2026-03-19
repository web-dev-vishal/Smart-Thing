import logger from '../utils/logger.js';

class RedisBalanceService {
  constructor(redisClient) {
    this.redis = redisClient;
  }

  getBalanceKey(userId) {
    return `balance:${userId}`;
  }

  async initializeBalance(userId, balance) {
    try {
      const key = this.getBalanceKey(userId);
      await this.redis.set(key, balance.toString());
      logger.debug(`Balance initialized for user ${userId}: ${balance}`);
    } catch (error) {
      logger.error(`Error initializing balance for ${userId}:`, error);
      throw error;
    }
  }

  async getBalance(userId) {
    try {
      const key = this.getBalanceKey(userId);
      const balance = await this.redis.get(key);
      
      if (balance === null) {
        return null;
      }

      return parseFloat(balance);
    } catch (error) {
      logger.error(`Error getting balance for ${userId}:`, error);
      throw error;
    }
  }

  async deductBalance(userId, amount) {
    try {
      const key = this.getBalanceKey(userId);

      const luaScript = `
        local current = redis.call("get", KEYS[1])
        if not current then
          return nil
        end
        
        current = tonumber(current)
        local amount = tonumber(ARGV[1])
        
        if current < amount then
          return -1
        end
        
        local new_balance = current - amount
        redis.call("set", KEYS[1], tostring(new_balance))
        return new_balance
      `;

      const result = await this.redis.eval(luaScript, 1, key, amount.toString());

      if (result === null) {
        throw new Error('BALANCE_NOT_FOUND');
      }

      if (result === -1) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      logger.debug(`Balance deducted for ${userId}`, {
        amount,
        newBalance: result,
      });

      return parseFloat(result);

    } catch (error) {
      logger.error(`Error deducting balance for ${userId}:`, error);
      throw error;
    }
  }

  async addBalance(userId, amount) {
    try {
      const key = this.getBalanceKey(userId);
      
      const luaScript = `
        local current = redis.call("get", KEYS[1])
        if not current then
          return nil
        end
        
        current = tonumber(current)
        local amount = tonumber(ARGV[1])
        local new_balance = current + amount
        redis.call("set", KEYS[1], tostring(new_balance))
        return new_balance
      `;

      const result = await this.redis.eval(luaScript, 1, key, amount.toString());

      if (result === null) {
        throw new Error('BALANCE_NOT_FOUND');
      }

      logger.debug(`Balance added for ${userId}`, {
        amount,
        newBalance: result,
      });

      return parseFloat(result);

    } catch (error) {
      logger.error(`Error adding balance for ${userId}:`, error);
      throw error;
    }
  }

  async hasSufficientBalance(userId, amount) {
    try {
      const balance = await this.getBalance(userId);
      
      if (balance === null) {
        return false;
      }

      return balance >= amount;
    } catch (error) {
      logger.error(`Error checking balance for ${userId}:`, error);
      throw error;
    }
  }

  async syncBalance(userId, balance) {
    await this.initializeBalance(userId, balance);
  }

  async deleteBalance(userId) {
    try {
      const key = this.getBalanceKey(userId);
      await this.redis.del(key);
      logger.debug(`Balance cache deleted for ${userId}`);
    } catch (error) {
      logger.error(`Error deleting balance for ${userId}:`, error);
      throw error;
    }
  }
}

export default RedisBalanceService;