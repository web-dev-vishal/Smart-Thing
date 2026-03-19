/**
 * Test Helper Utilities
 * 
 * Common utilities for testing across all test suites.
 */

import { faker } from '@faker-js/faker';
import jwt from 'jsonwebtoken';

/**
 * Generate a test user object
 */
export function generateTestUser(overrides = {}) {
  return {
    userId: faker.string.alphanumeric(10),
    username: faker.internet.userName(),
    email: faker.internet.email(),
    balance: faker.number.float({ min: 0, max: 10000, precision: 0.01 }),
    currency: faker.helpers.arrayElement(['USD', 'EUR', 'GBP', 'INR']),
    country: faker.location.countryCode(),
    status: 'active',
    role: 'user',
    ...overrides,
  };
}

/**
 * Generate a test transaction object
 */
export function generateTestTransaction(overrides = {}) {
  return {
    transactionId: `TXN_${faker.string.alphanumeric(6)}_${faker.string.alphanumeric(16)}`,
    userId: faker.string.alphanumeric(10),
    amount: faker.number.float({ min: 1, max: 1000, precision: 0.01 }),
    currency: faker.helpers.arrayElement(['USD', 'EUR', 'GBP', 'INR']),
    status: 'initiated',
    description: faker.lorem.sentence(),
    ipAddress: faker.internet.ip(),
    ...overrides,
  };
}

/**
 * Generate a test JWT token
 */
export function generateTestToken(payload = {}, expiresIn = '1h') {
  const defaultPayload = {
    userId: faker.string.alphanumeric(10),
    username: faker.internet.userName(),
    role: 'user',
    permissions: [],
  };

  return jwt.sign(
    { ...defaultPayload, ...payload },
    process.env.JWT_SECRET || 'test_secret',
    { expiresIn }
  );
}

/**
 * Generate an expired JWT token
 */
export function generateExpiredToken(payload = {}) {
  return generateTestToken(payload, '-1h');
}

/**
 * Generate a test API key
 */
export function generateTestAPIKey(prefix = 'sk_test') {
  return `${prefix}_${faker.string.alphanumeric(32)}`;
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Timeout waiting for condition');
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a mock request object
 */
export function createMockRequest(overrides = {}) {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    ip: faker.internet.ip(),
    socket: {
      remoteAddress: faker.internet.ip(),
    },
    ...overrides,
  };
}

/**
 * Create a mock response object
 */
export function createMockResponse() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  return res;
}

/**
 * Create a mock next function
 */
export function createMockNext() {
  return jest.fn();
}

/**
 * Assert that an error was thrown with specific message
 */
export async function expectError(fn, errorMessage) {
  try {
    await fn();
    throw new Error('Expected function to throw an error');
  } catch (error) {
    if (errorMessage) {
      expect(error.message).toContain(errorMessage);
    }
  }
}

/**
 * Generate random array of items
 */
export function generateArray(generator, count = 5) {
  return Array.from({ length: count }, () => generator());
}

/**
 * Clean up test data
 */
export async function cleanupTestData(models = []) {
  for (const model of models) {
    if (model && typeof model.deleteMany === 'function') {
      await model.deleteMany({});
    }
  }
}
