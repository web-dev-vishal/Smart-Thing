/**
 * Mock Services Index
 * 
 * Central export for all mock services used in testing.
 */

export { createMockRedis, createMockRedisWithData } from './mockRedis.js';
export { 
  startMockMongoDB, 
  stopMockMongoDB, 
  clearMockMongoDB, 
  getMockMongoDBUri 
} from './mockMongoDB.js';
export { createMockRabbitMQ, connect as mockRabbitMQConnect } from './mockRabbitMQ.js';
export { 
  MockGroqClient, 
  createMockGroqClient, 
  createMockGroqClientWithResponses 
} from './mockGroqClient.js';
export {
  MockIPValidator,
  MockCurrencyValidator,
  createMockIPValidator,
  createMockCurrencyValidator,
} from './mockExternalAPIs.js';

/**
 * Create all mocks at once
 */
export async function createAllMocks() {
  const redis = createMockRedis();
  const mongoServer = await startMockMongoDB();
  const rabbitmq = await createMockRabbitMQ();
  const groqClient = createMockGroqClient();
  const ipValidator = createMockIPValidator();
  const currencyValidator = createMockCurrencyValidator();

  return {
    redis,
    mongoServer,
    rabbitmq,
    groqClient,
    ipValidator,
    currencyValidator,
  };
}

/**
 * Clean up all mocks
 */
export async function cleanupAllMocks(mocks) {
  if (mocks.redis) {
    await mocks.redis.flushall();
  }

  if (mocks.mongoServer) {
    await stopMockMongoDB();
  }

  if (mocks.rabbitmq) {
    await mocks.rabbitmq.close();
  }

  if (mocks.groqClient) {
    mocks.groqClient.reset();
  }

  if (mocks.ipValidator) {
    mocks.ipValidator.reset();
  }

  if (mocks.currencyValidator) {
    mocks.currencyValidator.reset();
  }
}
