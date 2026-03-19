import { jest } from '@jest/globals';
import RedisBalanceService from '../../../src/services/RedisBalanceService.js';

describe('RedisBalanceService', () => {
  let service;
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      set: jest.fn(),
      get: jest.fn(),
      eval: jest.fn(),
      del: jest.fn(),
    };
    service = new RedisBalanceService(mockRedis);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ── getBalanceKey() ────────────────────────────────────────────────────────
  describe('getBalanceKey()', () => {
    it('should return correct balance key format', () => {
      const key = service.getBalanceKey('user_001');
      expect(key).toBe('balance:user_001');
    });

    it('should handle different user IDs', () => {
      expect(service.getBalanceKey('user_123')).toBe('balance:user_123');
      expect(service.getBalanceKey('admin')).toBe('balance:admin');
    });
  });

  // ── initializeBalance() ────────────────────────────────────────────────────
  describe('initializeBalance()', () => {
    it('should initialize balance successfully', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await service.initializeBalance('user_001', 1000);
      
      expect(mockRedis.set).toHaveBeenCalledWith('balance:user_001', '1000');
    });

    it('should handle decimal balances', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await service.initializeBalance('user_001', 1000.50);
      
      expect(mockRedis.set).toHaveBeenCalledWith('balance:user_001', '1000.5');
    });

    it('should handle zero balance', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await service.initializeBalance('user_001', 0);
      
      expect(mockRedis.set).toHaveBeenCalledWith('balance:user_001', '0');
    });

    it('should throw when Redis fails', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));
      
      await expect(service.initializeBalance('user_001', 1000))
        .rejects.toThrow('Redis error');
    });
  });

  // ── getBalance() ───────────────────────────────────────────────────────────
  describe('getBalance()', () => {
    it('should return balance as number', async () => {
      mockRedis.get.mockResolvedValue('1000');
      
      const balance = await service.getBalance('user_001');
      
      expect(balance).toBe(1000);
      expect(typeof balance).toBe('number');
      expect(mockRedis.get).toHaveBeenCalledWith('balance:user_001');
    });

    it('should return decimal balance correctly', async () => {
      mockRedis.get.mockResolvedValue('1000.50');
      
      const balance = await service.getBalance('user_001');
      
      expect(balance).toBe(1000.50);
    });

    it('should return null when balance does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const balance = await service.getBalance('user_001');
      
      expect(balance).toBeNull();
    });

    it('should handle zero balance', async () => {
      mockRedis.get.mockResolvedValue('0');
      
      const balance = await service.getBalance('user_001');
      
      expect(balance).toBe(0);
    });

    it('should throw when Redis fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      
      await expect(service.getBalance('user_001'))
        .rejects.toThrow('Redis error');
    });
  });

  // ── deductBalance() ────────────────────────────────────────────────────────
  describe('deductBalance()', () => {
    it('should deduct balance successfully', async () => {
      mockRedis.eval.mockResolvedValue(900); // 1000 - 100 = 900
      
      const newBalance = await service.deductBalance('user_001', 100);
      
      expect(newBalance).toBe(900);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'balance:user_001',
        '100'
      );
    });

    it('should handle decimal amounts', async () => {
      mockRedis.eval.mockResolvedValue(899.50);
      
      const newBalance = await service.deductBalance('user_001', 100.50);
      
      expect(newBalance).toBe(899.50);
    });

    it('should throw BALANCE_NOT_FOUND when balance does not exist', async () => {
      mockRedis.eval.mockResolvedValue(null);
      
      await expect(service.deductBalance('user_001', 100))
        .rejects.toThrow('BALANCE_NOT_FOUND');
    });

    it('should throw INSUFFICIENT_BALANCE when balance is too low', async () => {
      mockRedis.eval.mockResolvedValue(-1);
      
      await expect(service.deductBalance('user_001', 100))
        .rejects.toThrow('INSUFFICIENT_BALANCE');
    });

    it('should handle deducting to zero', async () => {
      mockRedis.eval.mockResolvedValue(0);
      
      const newBalance = await service.deductBalance('user_001', 1000);
      
      expect(newBalance).toBe(0);
    });

    it('should throw when Redis fails', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));
      
      await expect(service.deductBalance('user_001', 100))
        .rejects.toThrow('Redis error');
    });
  });

  // ── addBalance() ───────────────────────────────────────────────────────────
  describe('addBalance()', () => {
    it('should add balance successfully', async () => {
      mockRedis.eval.mockResolvedValue(1100); // 1000 + 100 = 1100
      
      const newBalance = await service.addBalance('user_001', 100);
      
      expect(newBalance).toBe(1100);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.any(String),
        1,
        'balance:user_001',
        '100'
      );
    });

    it('should handle decimal amounts', async () => {
      mockRedis.eval.mockResolvedValue(1100.50);
      
      const newBalance = await service.addBalance('user_001', 100.50);
      
      expect(newBalance).toBe(1100.50);
    });

    it('should throw BALANCE_NOT_FOUND when balance does not exist', async () => {
      mockRedis.eval.mockResolvedValue(null);
      
      await expect(service.addBalance('user_001', 100))
        .rejects.toThrow('BALANCE_NOT_FOUND');
    });

    it('should handle adding to zero balance', async () => {
      mockRedis.eval.mockResolvedValue(100);
      
      const newBalance = await service.addBalance('user_001', 100);
      
      expect(newBalance).toBe(100);
    });

    it('should throw when Redis fails', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis error'));
      
      await expect(service.addBalance('user_001', 100))
        .rejects.toThrow('Redis error');
    });
  });

  // ── hasSufficientBalance() ─────────────────────────────────────────────────
  describe('hasSufficientBalance()', () => {
    it('should return true when balance is sufficient', async () => {
      mockRedis.get.mockResolvedValue('1000');
      
      const result = await service.hasSufficientBalance('user_001', 500);
      
      expect(result).toBe(true);
    });

    it('should return true when balance equals amount', async () => {
      mockRedis.get.mockResolvedValue('1000');
      
      const result = await service.hasSufficientBalance('user_001', 1000);
      
      expect(result).toBe(true);
    });

    it('should return false when balance is insufficient', async () => {
      mockRedis.get.mockResolvedValue('1000');
      
      const result = await service.hasSufficientBalance('user_001', 1500);
      
      expect(result).toBe(false);
    });

    it('should return false when balance does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);
      
      const result = await service.hasSufficientBalance('user_001', 100);
      
      expect(result).toBe(false);
    });

    it('should handle decimal amounts', async () => {
      mockRedis.get.mockResolvedValue('1000.50');
      
      const result = await service.hasSufficientBalance('user_001', 1000.25);
      
      expect(result).toBe(true);
    });

    it('should throw when Redis fails', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      
      await expect(service.hasSufficientBalance('user_001', 100))
        .rejects.toThrow('Redis error');
    });
  });

  // ── syncBalance() ──────────────────────────────────────────────────────────
  describe('syncBalance()', () => {
    it('should sync balance by calling initializeBalance', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await service.syncBalance('user_001', 1000);
      
      expect(mockRedis.set).toHaveBeenCalledWith('balance:user_001', '1000');
    });

    it('should handle decimal balances', async () => {
      mockRedis.set.mockResolvedValue('OK');
      
      await service.syncBalance('user_001', 1000.50);
      
      expect(mockRedis.set).toHaveBeenCalledWith('balance:user_001', '1000.5');
    });
  });

  // ── deleteBalance() ────────────────────────────────────────────────────────
  describe('deleteBalance()', () => {
    it('should delete balance successfully', async () => {
      mockRedis.del.mockResolvedValue(1);
      
      await service.deleteBalance('user_001');
      
      expect(mockRedis.del).toHaveBeenCalledWith('balance:user_001');
    });

    it('should not throw when balance does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);
      
      await expect(service.deleteBalance('user_001')).resolves.not.toThrow();
    });

    it('should throw when Redis fails', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));
      
      await expect(service.deleteBalance('user_001'))
        .rejects.toThrow('Redis error');
    });
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────────
  describe('Edge Cases', () => {
    it('should handle very large balances', async () => {
      const largeBalance = 999999999.99;
      mockRedis.get.mockResolvedValue(largeBalance.toString());
      
      const balance = await service.getBalance('user_001');
      
      expect(balance).toBe(largeBalance);
    });

    it('should handle very small amounts', async () => {
      mockRedis.eval.mockResolvedValue(999.99);
      
      const newBalance = await service.deductBalance('user_001', 0.01);
      
      expect(newBalance).toBe(999.99);
    });

    it('should handle concurrent operations (Lua script atomicity)', async () => {
      // Lua scripts are atomic, so concurrent calls should be safe
      mockRedis.eval
        .mockResolvedValueOnce(900)
        .mockResolvedValueOnce(800);
      
      const [balance1, balance2] = await Promise.all([
        service.deductBalance('user_001', 100),
        service.deductBalance('user_001', 100),
      ]);
      
      expect(balance1).toBe(900);
      expect(balance2).toBe(800);
      expect(mockRedis.eval).toHaveBeenCalledTimes(2);
    });
  });
});
