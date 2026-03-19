import { jest } from '@jest/globals';

// Mock the Transaction model BEFORE any import that might trigger it.
// This intercepts the dynamic import() inside payout.controller.js → getTransactionHistory()
const mockTransaction = {
    find: jest.fn(),
};

jest.unstable_mockModule('../../src/models/Transaction.js', () => ({
    default: mockTransaction,
}));

// Import the controller AFTER the mock is registered
const { default: PayoutController } = await import('../../src/controllers/payout.controller.js');

describe('PayoutController', () => {
    let controller;
    let mockPayoutService;
    let req, res, next;

    beforeEach(() => {
        mockPayoutService = {
            initiatePayout: jest.fn(),
            getTransactionStatus: jest.fn(),
            getUserBalance: jest.fn(),
        };
        controller = new PayoutController(mockPayoutService);

        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };
        next = jest.fn();

        // Reset the Transaction mock's find() chain for each test
        mockTransaction.find.mockReturnValue({
            sort: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            lean: jest.fn().mockResolvedValue([]),
        });
    });

    // ── createPayout() ─────────────────────────────────────────────────────────
    describe('createPayout()', () => {
        it('should respond with 202 on successful payout initiation', async () => {
            req = {
                body: { userId: 'user_001', amount: 100, currency: 'USD', description: 'test payout' },
                ip: '127.0.0.1',
                socket: { remoteAddress: '127.0.0.1' },
                get: jest.fn().mockReturnValue('jest/test-agent'),
            };
            mockPayoutService.initiatePayout.mockResolvedValue({
                success: true, transactionId: 'TXN_001', status: 'initiated',
                amount: 100, currency: 'USD', message: 'Payout initiated', fraudScore: 20,
            });
            await controller.createPayout(req, res, next);
            expect(res.status).toHaveBeenCalledWith(202);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true, transactionId: 'TXN_001',
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should pass ip, userAgent, and source in metadata to service', async () => {
            req = {
                body: { userId: 'user_001', amount: 100, currency: 'USD' },
                ip: '8.8.8.8',
                socket: { remoteAddress: '8.8.8.8' },
                get: jest.fn().mockReturnValue('Mozilla/5.0'),
            };
            mockPayoutService.initiatePayout.mockResolvedValue({ success: true });

            await controller.createPayout(req, res, next);

            const [, metadata] = mockPayoutService.initiatePayout.mock.calls[0];
            expect(metadata.ipAddress).toBe('8.8.8.8');
            expect(metadata.userAgent).toBe('Mozilla/5.0');
            expect(metadata.source).toBe('api');
        });

        it('should call next(error) when service throws', async () => {
            req = {
                body: { userId: 'user_001', amount: 100, currency: 'USD' },
                ip: '127.0.0.1',
                socket: {},
                get: jest.fn().mockReturnValue('test'),
            };
            const error = { code: 'INSUFFICIENT_BALANCE', statusCode: 400 };
            mockPayoutService.initiatePayout.mockRejectedValue(error);
            await controller.createPayout(req, res, next);
            expect(next).toHaveBeenCalledWith(error);
            expect(res.status).not.toHaveBeenCalled();
        });
    });

    // ── getTransactionStatus() ─────────────────────────────────────────────────
    describe('getTransactionStatus()', () => {
        it('should respond with 200 and transaction details', async () => {
            req = { params: { transactionId: 'TXN_001' } };
            mockPayoutService.getTransactionStatus.mockResolvedValue({
                success: true,
                transaction: { transactionId: 'TXN_001', status: 'completed', amount: 100 },
            });
            await controller.getTransactionStatus(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should call next(error) when transaction is not found', async () => {
            req = { params: { transactionId: 'INVALID' } };
            mockPayoutService.getTransactionStatus.mockRejectedValue({
                code: 'TRANSACTION_NOT_FOUND', statusCode: 404,
            });
            await controller.getTransactionStatus(req, res, next);
            expect(next).toHaveBeenCalled();
        });
    });

    // ── getUserBalance() ────────────────────────────────────────────────────────
    describe('getUserBalance()', () => {
        it('should respond with 200 and user balance', async () => {
            req = { params: { userId: 'user_001' } };
            mockPayoutService.getUserBalance.mockResolvedValue({
                success: true, userId: 'user_001', balance: 5000, currency: 'USD',
            });
            await controller.getUserBalance(req, res, next);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true, balance: 5000,
            }));
        });

        it('should call next(error) when user is not found', async () => {
            req = { params: { userId: 'ghost_user' } };
            mockPayoutService.getUserBalance.mockRejectedValue({
                code: 'USER_NOT_FOUND', statusCode: 404,
            });
            await controller.getUserBalance(req, res, next);
            expect(next).toHaveBeenCalled();
        });
    });

    // ── getTransactionHistory() ────────────────────────────────────────────────
    describe('getTransactionHistory()', () => {
        it('should respond with 200 and transactions array', async () => {
            req = { params: { userId: 'user_001' }, query: { limit: '10' } };

            mockTransaction.find.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                lean: jest.fn().mockResolvedValue([
                    { transactionId: 'TXN_001', amount: 100, currency: 'USD', status: 'completed' },
                ]),
            });

            await controller.getTransactionHistory(req, res, next);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                count: 1,
            }));
            expect(next).not.toHaveBeenCalled();
        });

        it('should call next(error) on database error', async () => {
            req = { params: { userId: 'user_001' }, query: {} };

            mockTransaction.find.mockReturnValue({
                sort: jest.fn().mockReturnThis(),
                limit: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                lean: jest.fn().mockRejectedValue(new Error('DB connection failed')),
            });

            await controller.getTransactionHistory(req, res, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });
    });
});
