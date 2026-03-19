import { jest } from '@jest/globals';
import PayoutService from '../../../src/services/PayoutService.js';
import Transaction from '../../../src/models/Transaction.js';
import User from '../../../src/models/User.js';
import AuditLog from '../../../src/models/AuditLog.js';

jest.mock('../../../src/models/Transaction.js');
jest.mock('../../../src/models/User.js');
jest.mock('../../../src/models/AuditLog.js');

describe('PayoutService', () => {
    let service;
    let mockBalanceService;
    let mockDistributedLock;
    let mockMessagePublisher;
    let mockWebsocketServer;
    let mockIpValidator;
    let mockCurrencyValidator;
    let mockGroqClient;

    const mockUser = {
        userId: 'user_001',
        balance: 5000,
        status: 'active',
        country: 'US',
    };

    beforeEach(() => {
        process.env.FRAUD_RISK_THRESHOLD = '70';
        process.env.LOCK_TTL_MS = '30000';

        mockBalanceService = {
            getBalance: jest.fn().mockResolvedValue(5000),
            hasSufficientBalance: jest.fn().mockResolvedValue(true),
            syncBalance: jest.fn().mockResolvedValue(undefined),
        };
        mockDistributedLock = {
            acquireWithRetry: jest.fn().mockResolvedValue('lock_value_abc123'),
            release: jest.fn().mockResolvedValue(true),
        };
        mockMessagePublisher = {
            publishPayoutMessage: jest.fn().mockResolvedValue(true),
        };
        mockWebsocketServer = {
            emitPayoutInitiated: jest.fn(),
        };
        mockIpValidator = {
            validateIP: jest.fn().mockResolvedValue({
                valid: true, country: 'US', city: 'New York', region: 'NY', suspicious: false,
            }),
        };
        mockCurrencyValidator = {
            validateCurrency: jest.fn().mockResolvedValue({
                valid: true, exchangeRate: 1.0, amountInUSD: '100.00',
            }),
        };
        mockGroqClient = {
            scoreFraudRisk: jest.fn().mockResolvedValue({
                riskScore: 20, reasoning: 'Low risk', recommendation: 'approve', aiAvailable: true,
            }),
        };

        User.findByUserId = jest.fn().mockResolvedValue(mockUser);
        Transaction.countDocuments = jest.fn().mockResolvedValue(5);
        Transaction.create = jest.fn().mockResolvedValue({
            transactionId: 'TXN_001', _id: 'mongo_id_001',
        });
        AuditLog.logAction = jest.fn().mockResolvedValue(undefined);

        service = new PayoutService(
            mockBalanceService,
            mockDistributedLock,
            mockMessagePublisher,
            mockWebsocketServer,
            mockIpValidator,
            mockCurrencyValidator,
            mockGroqClient
        );
    });

    afterEach(() => {
        jest.clearAllMocks();
        delete process.env.FRAUD_RISK_THRESHOLD;
        delete process.env.LOCK_TTL_MS;
    });

    // ── initiatePayout() — success path ────────────────────────────────────────
    describe('initiatePayout() — success', () => {
        it('should return success=true with transactionId and status=initiated', async () => {
            const result = await service.initiatePayout(
                { userId: 'user_001', amount: 100, currency: 'USD', description: 'test payout' },
                { ipAddress: '8.8.8.8', userAgent: 'jest/test' }
            );
            expect(result.success).toBe(true);
            expect(result.status).toBe('initiated');
            expect(result.amount).toBe(100);
            expect(result.currency).toBe('USD');
            expect(result.fraudScore).toBe(20);
        });

        it('should call all 8 steps in the correct order', async () => {
            const callOrder = [];
            User.findByUserId.mockImplementation(async () => { callOrder.push('user_lookup'); return mockUser; });
            mockIpValidator.validateIP.mockImplementation(async () => { callOrder.push('ip_validate'); return { valid: true, country: 'US', suspicious: false }; });
            mockCurrencyValidator.validateCurrency.mockImplementation(async () => { callOrder.push('currency_validate'); return { valid: true, exchangeRate: 1 }; });
            mockDistributedLock.acquireWithRetry.mockImplementation(async () => { callOrder.push('lock_acquire'); return 'lv'; });
            mockBalanceService.hasSufficientBalance.mockImplementation(async () => { callOrder.push('balance_check'); return true; });
            mockGroqClient.scoreFraudRisk.mockImplementation(async () => { callOrder.push('fraud_score'); return { riskScore: 10, recommendation: 'approve', aiAvailable: true }; });
            Transaction.create.mockImplementation(async () => { callOrder.push('txn_create'); return { transactionId: 'TXN_X' }; });
            mockMessagePublisher.publishPayoutMessage.mockImplementation(async () => { callOrder.push('mq_publish'); return true; });

            await service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'USD' }, {});

            expect(callOrder[0]).toBe('user_lookup');
            expect(callOrder[1]).toBe('ip_validate');
            expect(callOrder[2]).toBe('currency_validate');
            expect(callOrder[3]).toBe('lock_acquire');
        });

        it('should emit WebSocket event after successful payout initiation', async () => {
            await service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'USD' }, {});
            expect(mockWebsocketServer.emitPayoutInitiated).toHaveBeenCalledWith(
                'user_001',
                expect.objectContaining({ status: 'initiated', amount: 100, currency: 'USD' })
            );
        });
    });

    // ── initiatePayout() — error paths ─────────────────────────────────────────
    describe('initiatePayout() — errors', () => {
        it('should throw USER_NOT_FOUND (404) when user does not exist', async () => {
            User.findByUserId.mockResolvedValue(null);
            await expect(
                service.initiatePayout({ userId: 'ghost_user', amount: 100, currency: 'USD' }, {})
            ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });
        });

        it('should throw USER_NOT_ACTIVE (403) when user is suspended', async () => {
            User.findByUserId.mockResolvedValue({ ...mockUser, status: 'suspended' });
            await expect(
                service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'USD' }, {})
            ).rejects.toMatchObject({ code: 'USER_NOT_ACTIVE', statusCode: 403 });
        });

        it('should throw CONCURRENT_REQUEST (409) when lock cannot be acquired', async () => {
            mockDistributedLock.acquireWithRetry.mockResolvedValue(null);
            await expect(
                service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'USD' }, {})
            ).rejects.toMatchObject({ code: 'CONCURRENT_REQUEST', statusCode: 409 });
        });

        it('should throw INSUFFICIENT_BALANCE (400) when balance is too low', async () => {
            mockBalanceService.hasSufficientBalance.mockResolvedValue(false);
            await expect(
                service.initiatePayout({ userId: 'user_001', amount: 99999, currency: 'USD' }, {})
            ).rejects.toMatchObject({ code: 'INSUFFICIENT_BALANCE', statusCode: 400 });
        });

        it('should throw HIGH_FRAUD_RISK (403) when fraud score >= threshold', async () => {
            mockGroqClient.scoreFraudRisk.mockResolvedValue({
                riskScore: 95, reasoning: 'Very high risk', recommendation: 'reject', aiAvailable: true,
            });
            await expect(
                service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'USD' }, {})
            ).rejects.toMatchObject({ code: 'HIGH_FRAUD_RISK', statusCode: 403 });
        });

        it('should throw INVALID_CURRENCY (400) when currency validation fails', async () => {
            mockCurrencyValidator.validateCurrency.mockResolvedValue({
                valid: false, error: 'INVALID_CURRENCY',
            });
            await expect(
                service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'XYZ' }, {})
            ).rejects.toMatchObject({ code: 'INVALID_CURRENCY', statusCode: 400 });
        });

        it('should throw QUEUE_ERROR (503) when message publish fails', async () => {
            mockMessagePublisher.publishPayoutMessage.mockResolvedValue(false);
            await expect(
                service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'USD' }, {})
            ).rejects.toMatchObject({ code: 'QUEUE_ERROR', statusCode: 503 });
        });

        it('should release lock when error occurs after lock acquisition', async () => {
            mockGroqClient.scoreFraudRisk.mockResolvedValue({
                riskScore: 99, reasoning: 'Extreme risk', recommendation: 'reject', aiAvailable: true,
            });
            try {
                await service.initiatePayout({ userId: 'user_001', amount: 100, currency: 'USD' }, {});
            } catch (_) { /* expected */ }
            expect(mockDistributedLock.release).toHaveBeenCalledWith('user_001', 'lock_value_abc123');
        });

        it('should NOT release lock when error occurs BEFORE lock acquisition', async () => {
            User.findByUserId.mockResolvedValue(null); // fails before lock
            try {
                await service.initiatePayout({ userId: 'ghost', amount: 100, currency: 'USD' }, {});
            } catch (_) { /* expected */ }
            expect(mockDistributedLock.release).not.toHaveBeenCalled();
        });
    });

    // ── getUserBalance() ───────────────────────────────────────────────────────
    describe('getUserBalance()', () => {
        it('should return balance from Redis cache', async () => {
            const result = await service.getUserBalance('user_001');
            expect(result.success).toBe(true);
            expect(result.balance).toBe(5000);
            expect(result.userId).toBe('user_001');
            expect(result.currency).toBe('USD');
        });

        it('should fallback to MongoDB when Redis has no cached balance', async () => {
            mockBalanceService.getBalance.mockResolvedValue(null);
            const result = await service.getUserBalance('user_001');
            expect(result.success).toBe(true);
            expect(result.balance).toBe(5000); // from mockUser.balance
            expect(mockBalanceService.syncBalance).toHaveBeenCalledWith('user_001', 5000);
        });

        it('should throw USER_NOT_FOUND when user missing from both Redis and MongoDB', async () => {
            mockBalanceService.getBalance.mockResolvedValue(null);
            User.findByUserId.mockResolvedValue(null);
            await expect(service.getUserBalance('ghost')).rejects.toMatchObject({
                code: 'USER_NOT_FOUND', statusCode: 404,
            });
        });
    });

    // ── getTransactionStatus() ─────────────────────────────────────────────────
    describe('getTransactionStatus()', () => {
        it('should return transaction details when found', async () => {
            Transaction.findByTransactionId = jest.fn().mockResolvedValue({
                transactionId: 'TXN_001', userId: 'user_001', amount: 100,
                currency: 'USD', status: 'completed', createdAt: new Date(),
                processingDetails: { completedAt: new Date() },
            });
            const result = await service.getTransactionStatus('TXN_001');
            expect(result.success).toBe(true);
            expect(result.transaction.transactionId).toBe('TXN_001');
            expect(result.transaction.status).toBe('completed');
        });

        it('should throw TRANSACTION_NOT_FOUND when transaction does not exist', async () => {
            Transaction.findByTransactionId = jest.fn().mockResolvedValue(null);
            await expect(service.getTransactionStatus('INVALID_TXN')).rejects.toMatchObject({
                code: 'TRANSACTION_NOT_FOUND', statusCode: 404,
            });
        });
    });
});
