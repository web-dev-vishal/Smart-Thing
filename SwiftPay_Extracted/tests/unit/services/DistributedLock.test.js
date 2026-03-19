import { jest } from '@jest/globals';
import DistributedLock from '../../../src/services/DistributedLock.js';

describe('DistributedLock', () => {
    let lock;
    let mockRedis;

    beforeEach(() => {
        mockRedis = {
            set: jest.fn(),
            eval: jest.fn(),
            exists: jest.fn(),
            del: jest.fn(),
        };
        lock = new DistributedLock(mockRedis);
    });

    // ── acquire() ──────────────────────────────────────────────────────────────
    describe('acquire()', () => {
        it('should acquire a lock and return a lockValue when Redis SET NX succeeds', async () => {
            mockRedis.set.mockResolvedValue('OK');
            const lockValue = await lock.acquire('user_001', 30000);
            expect(lockValue).toBeTruthy();
            expect(typeof lockValue).toBe('string');
            expect(mockRedis.set).toHaveBeenCalledWith(
                'lock:user_001',
                expect.any(String),
                'PX',
                30000,
                'NX'
            );
        });

        it('should return null when lock is already held (Redis SET NX returns null)', async () => {
            mockRedis.set.mockResolvedValue(null);
            const lockValue = await lock.acquire('user_001', 30000);
            expect(lockValue).toBeNull();
        });

        it('should throw when Redis throws an error', async () => {
            mockRedis.set.mockRejectedValue(new Error('Redis connection error'));
            await expect(lock.acquire('user_001', 30000)).rejects.toThrow('Redis connection error');
        });

        it('should use default TTL of 30000ms when not specified', async () => {
            mockRedis.set.mockResolvedValue('OK');
            await lock.acquire('user_001');
            expect(mockRedis.set).toHaveBeenCalledWith(
                'lock:user_001', expect.any(String), 'PX', 30000, 'NX'
            );
        });
    });

    // ── release() ──────────────────────────────────────────────────────────────
    describe('release()', () => {
        it('should release the lock and return true when lockValue matches', async () => {
            mockRedis.eval.mockResolvedValue(1);
            const result = await lock.release('user_001', 'abc123');
            expect(result).toBe(true);
            expect(mockRedis.eval).toHaveBeenCalledWith(
                expect.any(String), 1, 'lock:user_001', 'abc123'
            );
        });

        it('should return false when lockValue does not match (lock expired or taken)', async () => {
            mockRedis.eval.mockResolvedValue(0);
            const result = await lock.release('user_001', 'wrongvalue');
            expect(result).toBe(false);
        });

        it('should throw when Redis eval throws', async () => {
            mockRedis.eval.mockRejectedValue(new Error('eval error'));
            await expect(lock.release('user_001', 'abc')).rejects.toThrow('eval error');
        });
    });

    // ── extend() ───────────────────────────────────────────────────────────────
    describe('extend()', () => {
        it('should extend the lock TTL and return true when lock is owned', async () => {
            mockRedis.eval.mockResolvedValue(1);
            const result = await lock.extend('user_001', 'abc123', 15000);
            expect(result).toBe(true);
        });

        it('should return false when lock is expired or not owned', async () => {
            mockRedis.eval.mockResolvedValue(0);
            const result = await lock.extend('user_001', 'wrongvalue', 15000);
            expect(result).toBe(false);
        });
    });

    // ── isLocked() ─────────────────────────────────────────────────────────────
    describe('isLocked()', () => {
        it('should return true when the lock key exists in Redis', async () => {
            mockRedis.exists.mockResolvedValue(1);
            const result = await lock.isLocked('user_001');
            expect(result).toBe(true);
        });

        it('should return false when the lock key does not exist', async () => {
            mockRedis.exists.mockResolvedValue(0);
            const result = await lock.isLocked('user_001');
            expect(result).toBe(false);
        });
    });

    // ── acquireWithRetry() ─────────────────────────────────────────────────────
    describe('acquireWithRetry()', () => {
        it('should succeed on first attempt', async () => {
            mockRedis.set.mockResolvedValue('OK');
            const lockValue = await lock.acquireWithRetry('user_001', 30000, 3, 0);
            expect(lockValue).toBeTruthy();
            expect(mockRedis.set).toHaveBeenCalledTimes(1);
        });

        it('should retry and succeed on second attempt', async () => {
            mockRedis.set
                .mockResolvedValueOnce(null)   // first attempt fails
                .mockResolvedValueOnce('OK');  // second attempt succeeds
            const lockValue = await lock.acquireWithRetry('user_001', 30000, 3, 0);
            expect(lockValue).toBeTruthy();
            expect(mockRedis.set).toHaveBeenCalledTimes(2);
        });

        it('should return null after exhausting all retries', async () => {
            mockRedis.set.mockResolvedValue(null); // always fails
            const lockValue = await lock.acquireWithRetry('user_001', 30000, 3, 0);
            expect(lockValue).toBeNull();
            expect(mockRedis.set).toHaveBeenCalledTimes(3);
        });
    });

    // ── executeWithLock() ──────────────────────────────────────────────────────
    describe('executeWithLock()', () => {
        it('should execute the function and release the lock afterwards', async () => {
            mockRedis.set.mockResolvedValue('OK');
            mockRedis.eval.mockResolvedValue(1); // release succeeds
            const fn = jest.fn().mockResolvedValue('result');
            const result = await lock.executeWithLock('user_001', fn);
            expect(result).toBe('result');
            expect(fn).toHaveBeenCalledTimes(1);
            expect(mockRedis.eval).toHaveBeenCalledTimes(1); // release was called
        });

        it('should still release lock even if the function throws', async () => {
            mockRedis.set.mockResolvedValue('OK');
            mockRedis.eval.mockResolvedValue(1);
            const fn = jest.fn().mockRejectedValue(new Error('fn error'));
            await expect(lock.executeWithLock('user_001', fn)).rejects.toThrow('fn error');
            expect(mockRedis.eval).toHaveBeenCalledTimes(1); // lock was still released
        });

        it('should throw if lock cannot be acquired', async () => {
            mockRedis.set.mockResolvedValue(null);
            const fn = jest.fn();
            await expect(lock.executeWithLock('user_001', fn)).rejects.toThrow(
                'Unable to acquire lock for resource: user_001'
            );
            expect(fn).not.toHaveBeenCalled();
        });
    });
});
