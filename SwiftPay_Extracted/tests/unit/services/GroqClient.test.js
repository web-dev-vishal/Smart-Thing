import { jest } from '@jest/globals';
import GroqClient from '../../../src/services/GroqClient.js';

describe('GroqClient', () => {
    let client;

    beforeEach(() => {
        process.env.ENABLE_AI_FEATURES = 'true';
        process.env.GROQ_API_KEY = 'gsk_test_key_for_jest';
        client = new GroqClient();
    });

    afterEach(() => {
        delete process.env.ENABLE_AI_FEATURES;
        delete process.env.GROQ_API_KEY;
        jest.restoreAllMocks();
    });

    // ── scoreFraudRisk() — disabled/no key ────────────────────────────────────
    describe('scoreFraudRisk() — fallback behavior', () => {
        it('should return fallback score (50) when AI is disabled', async () => {
            process.env.ENABLE_AI_FEATURES = 'false';
            client = new GroqClient();
            const result = await client.scoreFraudRisk({
                userId: 'user_001', amount: 100, currency: 'USD',
                ipCountry: 'US', userCountry: 'US', transactionCount: 5,
            });
            expect(result.riskScore).toBe(50);
            expect(result.aiAvailable).toBe(false);
            expect(result.recommendation).toBe('review');
        });

        it('should return fallback score when API key is missing', async () => {
            delete process.env.GROQ_API_KEY;
            client = new GroqClient();
            const result = await client.scoreFraudRisk({
                userId: 'user_001', amount: 100, currency: 'USD',
                ipCountry: 'US', userCountry: 'US', transactionCount: 5,
            });
            expect(result.riskScore).toBe(50);
            expect(result.aiAvailable).toBe(false);
        });
    });

    // ── parseFraudScore() ──────────────────────────────────────────────────────
    describe('parseFraudScore()', () => {
        it('should parse valid JSON response correctly', () => {
            const response = '{"riskScore": 35, "reasoning": "Low risk transaction", "recommendation": "approve"}';
            const result = client.parseFraudScore(response);
            expect(result.riskScore).toBe(35);
            expect(result.reasoning).toBe('Low risk transaction');
            expect(result.recommendation).toBe('approve');
        });

        it('should handle JSON embedded within surrounding text', () => {
            const response = 'Analysis complete: {"riskScore": 80, "reasoning": "High risk", "recommendation": "reject"} end.';
            const result = client.parseFraudScore(response);
            expect(result.riskScore).toBe(80);
            expect(result.recommendation).toBe('reject');
        });

        it('should return fallback (50) when no JSON found in response', () => {
            const result = client.parseFraudScore('This is plain text with no JSON');
            expect(result.riskScore).toBe(50);
            expect(result.recommendation).toBe('review');
        });

        it('should return fallback when riskScore is below 0', () => {
            const response = '{"riskScore": -5, "reasoning": "test", "recommendation": "approve"}';
            const result = client.parseFraudScore(response);
            expect(result.riskScore).toBe(50); // invalid range → fallback
        });

        it('should return fallback when riskScore exceeds 100', () => {
            const response = '{"riskScore": 150, "reasoning": "test", "recommendation": "reject"}';
            const result = client.parseFraudScore(response);
            expect(result.riskScore).toBe(50);
        });

        it('should round riskScore to nearest integer', () => {
            const response = '{"riskScore": 42.7, "reasoning": "test", "recommendation": "approve"}';
            const result = client.parseFraudScore(response);
            expect(result.riskScore).toBe(43);
        });

        it('should use default values for missing fields', () => {
            const response = '{"riskScore": 30}';
            const result = client.parseFraudScore(response);
            expect(result.riskScore).toBe(30);
            expect(result.reasoning).toBe('No reasoning provided');
            expect(result.recommendation).toBe('review');
        });
    });

    // ── parseAnomalyResult() ───────────────────────────────────────────────────
    describe('parseAnomalyResult()', () => {
        it('should parse valid anomaly JSON correctly', () => {
            const response = '{"isAnomaly": true, "confidence": 0.95, "explanation": "Unusual amount detected"}';
            const result = client.parseAnomalyResult(response);
            expect(result.isAnomaly).toBe(true);
            expect(result.confidence).toBe(0.95);
            expect(result.explanation).toBe('Unusual amount detected');
        });

        it('should parse non-anomaly result', () => {
            const response = '{"isAnomaly": false, "confidence": 0.1, "explanation": "Normal pattern"}';
            const result = client.parseAnomalyResult(response);
            expect(result.isAnomaly).toBe(false);
        });

        it('should return safe defaults on malformed JSON', () => {
            const result = client.parseAnomalyResult('not json at all');
            expect(result.isAnomaly).toBe(false);
            expect(result.confidence).toBe(0);
        });

        it('should return fallback when isAnomaly is not boolean', () => {
            const response = '{"isAnomaly": "yes", "confidence": 0.9, "explanation": "test"}';
            const result = client.parseAnomalyResult(response);
            expect(result.isAnomaly).toBe(false); // fallback
        });

        it('should return fallback when confidence is out of range', () => {
            const response = '{"isAnomaly": true, "confidence": 1.5, "explanation": "test"}';
            const result = client.parseAnomalyResult(response);
            expect(result.isAnomaly).toBe(false);
        });

        it('should use default explanation when missing', () => {
            const response = '{"isAnomaly": false, "confidence": 0.2}';
            const result = client.parseAnomalyResult(response);
            expect(result.explanation).toBe('No explanation provided');
        });
    });

    // ── getStats() ─────────────────────────────────────────────────────────────
    describe('getStats()', () => {
        it('should return correct statistics', () => {
            client.requestCount = 10;
            client.errorCount = 2;
            const stats = client.getStats();
            expect(stats.totalRequests).toBe(10);
            expect(stats.totalErrors).toBe(2);
            expect(stats.successRate).toBe('80.00%');
            expect(stats.enabled).toBe(true);
            expect(stats.model).toBe('llama-3.3-70b-versatile');
        });

        it('should return "0%" success rate when no requests made', () => {
            const stats = client.getStats();
            expect(stats.successRate).toBe('0%');
            expect(stats.totalRequests).toBe(0);
        });
    });

    // ── resetStats() ───────────────────────────────────────────────────────────
    describe('resetStats()', () => {
        it('should reset both counters to zero', () => {
            client.requestCount = 50;
            client.errorCount = 10;
            client.resetStats();
            expect(client.requestCount).toBe(0);
            expect(client.errorCount).toBe(0);
        });
    });
});
