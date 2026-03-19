import { jest } from '@jest/globals';
import IPValidator from '../../../src/services/IPValidator.js';

describe('IPValidator', () => {
    let validator;
    let mockRedis;

    beforeEach(() => {
        process.env.ENABLE_IP_VALIDATION = 'true';
        mockRedis = {
            get: jest.fn(),
            setex: jest.fn().mockResolvedValue('OK'),
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
        };
        validator = new IPValidator(mockRedis);
    });

    afterEach(() => {
        delete process.env.ENABLE_IP_VALIDATION;
        jest.restoreAllMocks();
    });

    // ── disabled ───────────────────────────────────────────────────────────────
    describe('validateIP() — validation disabled', () => {
        it('should return valid=true, suspicious=false, cached=false when disabled', async () => {
            process.env.ENABLE_IP_VALIDATION = 'false';
            validator = new IPValidator(mockRedis);
            const result = await validator.validateIP('8.8.8.8', 'US');
            expect(result.valid).toBe(true);
            expect(result.suspicious).toBe(false);
            expect(result.cached).toBe(false);
            expect(mockRedis.get).not.toHaveBeenCalled();
        });
    });

    // ── localhost bypass ───────────────────────────────────────────────────────
    describe('validateIP() — localhost bypass', () => {
        it('should skip validation for 127.0.0.1 and return localhost country', async () => {
            const result = await validator.validateIP('127.0.0.1', 'US');
            expect(result.valid).toBe(true);
            expect(result.country).toBe('localhost');
            expect(result.suspicious).toBe(false);
        });

        it('should skip validation for ::1 (IPv6 loopback)', async () => {
            const result = await validator.validateIP('::1', 'US');
            expect(result.valid).toBe(true);
            expect(result.country).toBe('localhost');
        });

        it('should skip validation for null/undefined ip', async () => {
            const result = await validator.validateIP(null, 'US');
            expect(result.valid).toBe(true);
            expect(result.country).toBe('localhost');
        });
    });

    // ── cache hit ──────────────────────────────────────────────────────────────
    describe('validateIP() — cache hit', () => {
        it('should return cached country and mark suspicious when countries differ', async () => {
            mockRedis.get.mockResolvedValue(
                JSON.stringify({ country: 'CN', city: 'Beijing', region: 'Beijing' })
            );
            const result = await validator.validateIP('1.2.3.4', 'US');
            expect(result.valid).toBe(true);
            expect(result.country).toBe('CN');
            expect(result.suspicious).toBe(true);
            expect(result.cached).toBe(true);
        });

        it('should NOT mark suspicious when IP country matches user country', async () => {
            mockRedis.get.mockResolvedValue(
                JSON.stringify({ country: 'US', city: 'New York', region: 'NY' })
            );
            const result = await validator.validateIP('8.8.8.8', 'US');
            expect(result.suspicious).toBe(false);
            expect(result.cached).toBe(true);
        });

        it('should NOT mark suspicious when userCountry is null', async () => {
            mockRedis.get.mockResolvedValue(
                JSON.stringify({ country: 'DE', city: 'Berlin', region: 'Berlin' })
            );
            const result = await validator.validateIP('5.6.7.8', null);
            expect(result.suspicious).toBe(false); // no user country to compare against
        });
    });

    // ── incrementAPICounter() ──────────────────────────────────────────────────
    describe('incrementAPICounter()', () => {
        it('should increment Redis counter and set expiry', async () => {
            await validator.incrementAPICounter('ipapi');
            expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('ipapi'));
            expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 86400);
        });

        it('should return counter value', async () => {
            mockRedis.incr.mockResolvedValue(5);
            const count = await validator.incrementAPICounter('ipapi');
            expect(count).toBe(5);
        });

        it('should return 0 on Redis error (non-critical path)', async () => {
            mockRedis.incr.mockRejectedValue(new Error('Redis error'));
            const count = await validator.incrementAPICounter('ipapi');
            expect(count).toBe(0); // fails silently
        });
    });

    // ── getAPILimit() ──────────────────────────────────────────────────────────
    describe('getAPILimit()', () => {
        it('should return 1000 for ipapi service', () => {
            expect(validator.getAPILimit('ipapi')).toBe(1000);
        });

        it('should return 1500 for exchangerate service', () => {
            expect(validator.getAPILimit('exchangerate')).toBe(1500);
        });

        it('should return 14400 for groq service', () => {
            expect(validator.getAPILimit('groq')).toBe(14400);
        });

        it('should return default 1000 for unknown service', () => {
            expect(validator.getAPILimit('unknown_svc')).toBe(1000);
        });
    });

    // ── getAPIUsage() ──────────────────────────────────────────────────────────
    describe('getAPIUsage()', () => {
        it('should return usage stats with correct percentage', async () => {
            mockRedis.get.mockResolvedValue('100');
            const usage = await validator.getAPIUsage('ipapi');
            expect(usage.service).toBe('ipapi');
            expect(usage.count).toBe(100);
            expect(usage.limit).toBe(1000);
            expect(usage.percentage).toBe(10);
        });

        it('should return 0 count and 0% when key does not exist', async () => {
            mockRedis.get.mockResolvedValue(null);
            const usage = await validator.getAPIUsage('ipapi');
            expect(usage.count).toBe(0);
            expect(usage.percentage).toBe(0);
        });

        it('should return zeros on Redis error', async () => {
            mockRedis.get.mockRejectedValue(new Error('Redis read failed'));
            const usage = await validator.getAPIUsage('ipapi');
            expect(usage.count).toBe(0);
            expect(usage.percentage).toBe(0);
        });
    });
});
