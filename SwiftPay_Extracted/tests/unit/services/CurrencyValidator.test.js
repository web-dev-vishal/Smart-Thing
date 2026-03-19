import { jest } from '@jest/globals';
import CurrencyValidator from '../../../src/services/CurrencyValidator.js';

describe('CurrencyValidator', () => {
    let validator;
    let mockRedis;

    beforeEach(() => {
        process.env.ENABLE_CURRENCY_VALIDATION = 'true';
        process.env.EXCHANGE_RATE_API_KEY = 'test_exchange_key';
        mockRedis = {
            get: jest.fn(),
            setex: jest.fn().mockResolvedValue('OK'),
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
        };
        validator = new CurrencyValidator(mockRedis);
    });

    afterEach(() => {
        delete process.env.ENABLE_CURRENCY_VALIDATION;
        delete process.env.EXCHANGE_RATE_API_KEY;
    });

    // ── disabled ───────────────────────────────────────────────────────────────
    describe('validateCurrency() — validation disabled', () => {
        it('should return valid=true with null rates when disabled', async () => {
            process.env.ENABLE_CURRENCY_VALIDATION = 'false';
            validator = new CurrencyValidator(mockRedis);
            const result = await validator.validateCurrency('USD', 100);
            expect(result.valid).toBe(true);
            expect(result.exchangeRate).toBeNull();
            expect(result.amountInUSD).toBeNull();
        });
    });

    // ── missing currency code ──────────────────────────────────────────────────
    describe('validateCurrency() — missing currency', () => {
        it('should return valid=false for null currency', async () => {
            const result = await validator.validateCurrency(null, 100);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('Currency code is required');
        });

        it('should return valid=false for empty string currency', async () => {
            const result = await validator.validateCurrency('', 100);
            expect(result.valid).toBe(false);
        });
    });

    // ── cache hit ──────────────────────────────────────────────────────────────
    describe('validateCurrency() — cache hit', () => {
        it('should return cached rate and compute amountInUSD correctly', async () => {
            mockRedis.get.mockResolvedValue(
                JSON.stringify({ rate: 83.12, lastUpdated: '2024-01-01T00:00:00.000Z' })
            );
            const result = await validator.validateCurrency('INR', 830);
            expect(result.valid).toBe(true);
            expect(result.exchangeRate).toBe(83.12);
            expect(result.cached).toBe(true);
            expect(parseFloat(result.amountInUSD)).toBeCloseTo(9.98, 1);
        });

        it('should return null amountInUSD when no amount provided', async () => {
            mockRedis.get.mockResolvedValue(
                JSON.stringify({ rate: 1.0, lastUpdated: '2024-01-01T00:00:00.000Z' })
            );
            const result = await validator.validateCurrency('USD', null);
            expect(result.amountInUSD).toBeNull();
        });
    });

    // ── useFallbackRates() ─────────────────────────────────────────────────────
    describe('useFallbackRates()', () => {
        it('should return valid=true and rate=1.0 for USD', async () => {
            const result = await validator.useFallbackRates('USD', 100);
            expect(result.valid).toBe(true);
            expect(result.exchangeRate).toBe(1.0);
            expect(result.fallback).toBe(true);
            expect(result.amountInUSD).toBe('100.00');
        });

        it('should return valid=true for EUR with known rate', async () => {
            const result = await validator.useFallbackRates('EUR', 92);
            expect(result.valid).toBe(true);
            expect(result.exchangeRate).toBe(0.92);
        });

        it('should return valid=false for unknown currency', async () => {
            const result = await validator.useFallbackRates('XYZ', 100);
            expect(result.valid).toBe(false);
            expect(result.error).toBe('CURRENCY_SERVICE_UNAVAILABLE');
        });

        it('should return null amountInUSD when no amount passed', async () => {
            const result = await validator.useFallbackRates('USD', null);
            expect(result.amountInUSD).toBeNull();
        });
    });

    // ── getSupportedCurrencies() ───────────────────────────────────────────────
    describe('getSupportedCurrencies()', () => {
        it('should return a list of currencies with correct count', async () => {
            const result = await validator.getSupportedCurrencies();
            expect(result.success).toBe(true);
            expect(Array.isArray(result.currencies)).toBe(true);
            expect(result.count).toBe(result.currencies.length);
            expect(result.count).toBeGreaterThan(10); // at least 10 currencies
        });

        it('should include common currencies', async () => {
            const result = await validator.getSupportedCurrencies();
            expect(result.currencies).toContain('USD');
            expect(result.currencies).toContain('EUR');
            expect(result.currencies).toContain('GBP');
            expect(result.currencies).toContain('INR');
            expect(result.currencies).toContain('JPY');
        });
    });

    // ── convertCurrency() ──────────────────────────────────────────────────────
    describe('convertCurrency()', () => {
        it('should convert between currencies using fallback rates when cache is cold', async () => {
            // Cache miss → will use fallback rates (no API call in test)
            mockRedis.get.mockResolvedValue(null);
            // Remove API key so it uses fallback
            delete process.env.EXCHANGE_RATE_API_KEY;
            validator = new CurrencyValidator(mockRedis);

            const result = await validator.convertCurrency(100, 'USD', 'EUR');
            expect(result.success).toBe(true);
            expect(result.from.currency).toBe('USD');
            expect(result.to.currency).toBe('EUR');
            expect(parseFloat(result.to.amount)).toBeGreaterThan(0);
        });
    });

    // ── getCurrencyInfo() ──────────────────────────────────────────────────────
    describe('getCurrencyInfo()', () => {
        it('should return currency name/symbol for known currencies', async () => {
            mockRedis.get.mockResolvedValue(
                JSON.stringify({ rate: 1.0, lastUpdated: '2024-01-01T00:00:00.000Z' })
            );
            const result = await validator.getCurrencyInfo('USD');
            expect(result.success).toBe(true);
            expect(result.currency).toBe('USD');
            expect(result.name).toBe('US Dollar');
            expect(result.symbol).toBe('$');
        });

        it('should return success=false for unknown currencies', async () => {
            const result = await validator.getCurrencyInfo('XYZ');
            expect(result.success).toBe(false);
            expect(result.error).toBe('Currency information not available');
        });
    });
});
