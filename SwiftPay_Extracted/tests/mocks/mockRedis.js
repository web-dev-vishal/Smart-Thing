/**
 * Mock Redis Client for Testing
 * 
 * Uses ioredis-mock to simulate Redis operations in tests.
 */

import RedisMock from 'ioredis-mock';

/**
 * Create a mock Redis client
 */
export function createMockRedis() {
  const redis = new RedisMock({
    data: {},
  });

  // Add custom methods if needed
  redis.flushall = async function() {
    this.data = {};
  };

  return redis;
}

/**
 * Create a mock Redis client with predefined data
 */
export function createMockRedisWithData(initialData = {}) {
  const redis = new RedisMock({
    data: initialData,
  });

  return redis;
}

export default createMockRedis;
