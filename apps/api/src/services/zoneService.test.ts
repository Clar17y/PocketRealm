import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./cacheService', () => ({
  cachedQuery: vi.fn(),
  invalidateCache: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { cachedQuery, invalidateCache } from './cacheService';
import { getPlayerZoneId, invalidateZoneIdCache } from './zoneService';

const mockCachedQuery = vi.mocked(cachedQuery);
const mockInvalidateCache = vi.mocked(invalidateCache);

describe('zoneService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlayerZoneId', () => {
    it('calls cachedQuery with correct key and TTL', async () => {
      mockCachedQuery.mockResolvedValue('zone-123');
      const result = await getPlayerZoneId('player-1');

      expect(result).toBe('zone-123');
      expect(mockCachedQuery).toHaveBeenCalledWith(
        'player:zone:player-1',
        expect.any(Function),
        60,
      );
    });

    it('fetcher queries prisma for currentZoneId', async () => {
      mockCachedQuery.mockImplementation(async (_key, fetcher) => fetcher());
      mockPrisma.player.findUnique.mockResolvedValue({ currentZoneId: 'zone-456' });

      const result = await getPlayerZoneId('player-2');

      expect(result).toBe('zone-456');
      expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
        where: { id: 'player-2' },
        select: { currentZoneId: true },
      });
    });

    it('returns null when player not found', async () => {
      mockCachedQuery.mockImplementation(async (_key, fetcher) => fetcher());
      mockPrisma.player.findUnique.mockResolvedValue(null);

      const result = await getPlayerZoneId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('invalidateZoneIdCache', () => {
    it('invalidates the correct cache key', async () => {
      await invalidateZoneIdCache('player-1');
      expect(mockInvalidateCache).toHaveBeenCalledWith('player:zone:player-1');
    });
  });
});
