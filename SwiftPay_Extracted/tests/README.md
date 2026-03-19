# SwiftPay Test Suite

This directory contains the comprehensive test suite for SwiftPay, covering unit tests, integration tests, security tests, and performance tests.

## Test Structure

```
tests/
├── setup.js                 # Global test setup
├── utils/
│   └── testHelpers.js      # Common test utilities
├── unit/                    # Unit tests (isolated component testing)
│   ├── services/           # Service layer tests
│   ├── controllers/        # Controller tests
│   ├── middleware/         # Middleware tests
│   └── models/             # Model tests
├── integration/            # Integration tests (end-to-end flows)
│   ├── payout.test.js     # Payout flow tests
│   ├── auth.test.js       # Authentication flow tests
│   └── websocket.test.js  # WebSocket tests
├── security/               # Security and penetration tests
│   ├── injection.test.js  # SQL/NoSQL injection tests
│   ├── xss.test.js        # XSS tests
│   └── auth.test.js       # Authentication bypass tests
└── performance/            # Performance and load tests
    └── load-test.yml      # Artillery load test configuration
```

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Unit Tests Only
```bash
npm run test:unit
```

### Run Integration Tests Only
```bash
npm run test:integration
```

### Run Security Tests Only
```bash
npm run test:security
```

### Run Performance Tests
```bash
npm run test:performance
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Tests with Docker
```bash
npm run docker:test
```

## Test Coverage

The project aims for 90%+ test coverage across all metrics:
- Line coverage: 90%+
- Branch coverage: 85%+
- Function coverage: 95%+
- Statement coverage: 90%+

View coverage report:
```bash
npm test
# Open coverage/lcov-report/index.html in browser
```

## Writing Tests

### Unit Test Example

```javascript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DistributedLock } from '../../src/services/DistributedLock.js';
import RedisMock from 'ioredis-mock';

describe('DistributedLock', () => {
  let lock;
  let redisMock;

  beforeEach(() => {
    redisMock = new RedisMock();
    lock = new DistributedLock(redisMock);
  });

  afterEach(() => {
    redisMock.flushall();
  });

  it('should acquire lock successfully', async () => {
    const lockValue = await lock.acquire('user_001', 30000);
    expect(lockValue).toBeTruthy();
  });
});
```

### Integration Test Example

```javascript
import request from 'supertest';
import { createTestApp } from '../utils/testApp.js';
import { generateTestUser, generateTestToken } from '../utils/testHelpers.js';

describe('Payout API', () => {
  let app;
  let token;

  beforeAll(async () => {
    app = await createTestApp();
    token = generateTestToken({ role: 'user' });
  });

  it('should create payout successfully', async () => {
    const response = await request(app)
      .post('/api/payout')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: 'user_001',
        amount: 100,
        currency: 'USD',
        description: 'Test payout'
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });
});
```

## Test Utilities

The `tests/utils/testHelpers.js` module provides common utilities:

- `generateTestUser()` - Generate test user data
- `generateTestTransaction()` - Generate test transaction data
- `generateTestToken()` - Generate JWT token for testing
- `generateExpiredToken()` - Generate expired JWT token
- `createMockRequest()` - Create mock Express request
- `createMockResponse()` - Create mock Express response
- `waitFor()` - Wait for async condition
- `sleep()` - Sleep for specified time
- `cleanupTestData()` - Clean up test data from database

## Mocking

### Redis Mocking
```javascript
import RedisMock from 'ioredis-mock';
const redis = new RedisMock();
```

### MongoDB Mocking
```javascript
import { MongoMemoryServer } from 'mongodb-memory-server';
const mongoServer = await MongoMemoryServer.create();
```

### External API Mocking
```javascript
jest.mock('../../src/services/GroqClient.js', () => ({
  assessFraudRisk: jest.fn().mockResolvedValue({
    riskScore: 25,
    riskLevel: 'LOW'
  })
}));
```

## CI/CD Integration

Tests are automatically run on:
- Every pull request
- Every push to main/develop branches
- Before deployment

See `.github/workflows/ci.yml` for CI configuration.

## Troubleshooting

### Tests Timing Out
Increase timeout in jest.config.cjs or individual tests:
```javascript
jest.setTimeout(30000); // 30 seconds
```

### Port Already in Use
Change PORT in .env.test to an available port.

### MongoDB Connection Issues
Ensure mongodb-memory-server is properly installed:
```bash
npm install mongodb-memory-server --save-dev
```

### Coverage Not Meeting Threshold
Run tests with coverage to see which files need more tests:
```bash
npm test
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data in afterEach/afterAll hooks
3. **Mocking**: Mock external dependencies to keep tests fast and reliable
4. **Assertions**: Use specific assertions (toBe, toEqual, toContain) instead of just truthiness
5. **Descriptive Names**: Use clear, descriptive test names that explain what is being tested
6. **AAA Pattern**: Arrange, Act, Assert - structure tests clearly
7. **Edge Cases**: Test boundary conditions, null values, and error scenarios
8. **Property Tests**: Use fast-check for property-based testing of invariants

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [fast-check Documentation](https://github.com/dubzzz/fast-check)
- [Artillery Documentation](https://www.artillery.io/docs)
