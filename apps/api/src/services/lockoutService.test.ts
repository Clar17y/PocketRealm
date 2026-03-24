import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  incr: vi.fn(),
  expire: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
}));

vi.mock('../redis', () => ({ redis: mockRedis }));

import { recordFailedLogin, isLockedOut, clearLockout } from './lockoutService';

const PLAYER_ID = 'player-1';

describe('lockoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordFailedLogin', () => {
    it('increments the counter and sets TTL on first failure', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await recordFailedLogin(PLAYER_ID);

      expect(mockRedis.incr).toHaveBeenCalledWith(`login:lockout:${PLAYER_ID}`);
      expect(mockRedis.expire).toHaveBeenCalledWith(`login:lockout:${PLAYER_ID}`, 900);
    });

    it('does not reset TTL on subsequent failures', async () => {
      mockRedis.incr.mockResolvedValue(3);

      await recordFailedLogin(PLAYER_ID);

      expect(mockRedis.incr).toHaveBeenCalled();
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('isLockedOut', () => {
    it('returns false when no key exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      expect(await isLockedOut(PLAYER_ID)).toBe(false);
    });

    it('returns false when attempts < 5', async () => {
      mockRedis.get.mockResolvedValue('4');
      expect(await isLockedOut(PLAYER_ID)).toBe(false);
    });

    it('returns true when attempts >= 5', async () => {
      mockRedis.get.mockResolvedValue('5');
      expect(await isLockedOut(PLAYER_ID)).toBe(true);
    });
  });

  describe('clearLockout', () => {
    it('deletes the lockout key', async () => {
      await clearLockout(PLAYER_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(`login:lockout:${PLAYER_ID}`);
    });
  });
});
