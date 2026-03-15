import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import { cachedQuery, invalidateCache } from '../cacheService';
import { redis } from '../../redis';

describe('cacheService', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  describe('cachedQuery', () => {
    it('returns cached value on hit', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify({ hp: 100 }));
      const fetcher = vi.fn();
      const result = await cachedQuery('test:key', fetcher, 60);
      expect(result).toEqual({ hp: 100 });
      expect(fetcher).not.toHaveBeenCalled();
    });

    it('calls fetcher and caches on miss', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      const fetcher = vi.fn().mockResolvedValue({ hp: 200 });
      const result = await cachedQuery('test:key', fetcher, 60);
      expect(result).toEqual({ hp: 200 });
      expect(redis.set).toHaveBeenCalledWith('test:key', JSON.stringify({ hp: 200 }), 'EX', 60);
    });

    it('falls back to fetcher on Redis error', async () => {
      vi.mocked(redis.get).mockRejectedValue(new Error('Redis down'));
      const fetcher = vi.fn().mockResolvedValue({ hp: 300 });
      const result = await cachedQuery('test:key', fetcher, 60);
      expect(result).toEqual({ hp: 300 });
    });
  });

  describe('invalidateCache', () => {
    it('deletes one or more keys', async () => {
      vi.mocked(redis.del).mockResolvedValue(1);
      await invalidateCache('key1', 'key2');
      expect(redis.del).toHaveBeenCalledWith('key1', 'key2');
    });
  });
});
