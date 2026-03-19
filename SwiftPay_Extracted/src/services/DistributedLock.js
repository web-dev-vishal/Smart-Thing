import crypto from 'crypto';
import logger from '../utils/logger.js';

class DistributedLock {
  constructor(redisClient) {
    this.redis = redisClient;
    this.locks = new Map();
  }

  generateLockValue() {
    return crypto.randomBytes(16).toString('hex');
  }

  async acquire(resource, ttl = 30000) {
    try {
      const lockKey = `lock:${resource}`;
      const lockValue = this.generateLockValue();

      const result = await this.redis.set(
        lockKey,
        lockValue,
        'PX',
        ttl,
        'NX'
      );

      if (result === 'OK') {
        this.locks.set(lockKey, lockValue);
        logger.debug(`Lock acquired for ${resource}`, {
          resource,
          lockValue,
          ttl,
        });
        return lockValue;
      }

      logger.warn(`Failed to acquire lock for ${resource} - already locked`);
      return null;

    } catch (error) {
      logger.error(`Error acquiring lock for ${resource}:`, error);
      throw error;
    }
  }

  async release(resource, lockValue) {
    try {
      const lockKey = `lock:${resource}`;

      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(luaScript, 1, lockKey, lockValue);

      if (result === 1) {
        this.locks.delete(lockKey);
        logger.debug(`Lock released for ${resource}`, {
          resource,
          lockValue,
        });
        return true;
      }

      logger.warn(`Failed to release lock for ${resource} - lock not owned or expired`);
      return false;

    } catch (error) {
      logger.error(`Error releasing lock for ${resource}:`, error);
      throw error;
    }
  }

  async extend(resource, lockValue, additionalTtl = 30000) {
    try {
      const lockKey = `lock:${resource}`;

      const luaScript = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(
        luaScript,
        1,
        lockKey,
        lockValue,
        additionalTtl
      );

      if (result === 1) {
        logger.debug(`Lock extended for ${resource}`, {
          resource,
          additionalTtl,
        });
        return true;
      }

      logger.warn(`Failed to extend lock for ${resource}`);
      return false;

    } catch (error) {
      logger.error(`Error extending lock for ${resource}:`, error);
      throw error;
    }
  }

  async isLocked(resource) {
    try {
      const lockKey = `lock:${resource}`;
      const exists = await this.redis.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Error checking lock for ${resource}:`, error);
      throw error;
    }
  }

  async acquireWithRetry(resource, ttl = 30000, maxRetries = 3, retryDelay = 100) {
    let attempts = 0;

    while (attempts < maxRetries) {
      const lockValue = await this.acquire(resource, ttl);
      
      if (lockValue) {
        return lockValue;
      }

      attempts++;
      
      if (attempts < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempts));
      }
    }

    logger.warn(`Failed to acquire lock after ${maxRetries} attempts`, { resource });
    return null;
  }

  async executeWithLock(resource, fn, ttl = 30000) {
    const lockValue = await this.acquire(resource, ttl);

    if (!lockValue) {
      throw new Error(`Unable to acquire lock for resource: ${resource}`);
    }

    try {
      const result = await fn();
      return result;
    } finally {
      await this.release(resource, lockValue);
    }
  }
}

export default DistributedLock;