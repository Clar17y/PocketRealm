import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../redis', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    sadd: vi.fn(),
    smembers: vi.fn(),
  },
}));

vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));

import { redis } from '../../redis';
import { prisma } from '@pocketrealm/database';
import {
  getCachedZones,
  getCachedZoneConnections,
  getCachedMobTemplatesByZone,
  getCachedResourceNodesByZone,
  getCachedBossMobTemplates,
  getCachedExpeditionMobTemplates,
  getCachedCraftingRecipes,
  getCachedZoneMobFamilies,
  invalidateStaticCache,
} from '../staticDataCacheService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as unknown as Record<string, any>;

const ZONE_A = { id: 'z1', name: 'Forest', difficulty: 1, zoneType: 'wild', isStarter: false };
const MOB_A = { id: 'm1', name: 'Rat', zoneId: 'z1', level: 1, hp: 20 };

beforeEach(() => { vi.clearAllMocks(); });

describe('staticDataCacheService', () => {
  describe('getCachedZones', () => {
    it('returns zones from DB on cache miss and caches result', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(redis.sadd).mockResolvedValue(1);
      db.zone.findMany.mockResolvedValue([ZONE_A]);

      const result = await getCachedZones();
      expect(result).toEqual([ZONE_A]);
      expect(db.zone.findMany).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
    });

    it('returns cached zones without hitting DB', async () => {
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify([ZONE_A]));
      const result = await getCachedZones();
      expect(result).toEqual([ZONE_A]);
      expect(db.zone.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getCachedMobTemplatesByZone', () => {
    it('caches per zone', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(redis.sadd).mockResolvedValue(1);
      db.mobTemplate.findMany.mockResolvedValue([MOB_A]);

      const result = await getCachedMobTemplatesByZone('z1');
      expect(result).toEqual([MOB_A]);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining('z1'),
        expect.any(String),
        'EX',
        86400,
      );
    });
  });

  describe('invalidateStaticCache', () => {
    it('deletes all tracked static cache keys', async () => {
      vi.mocked(redis.smembers).mockResolvedValue([
        'static:zones:all',
        'static:mobs:zone:z1',
      ]);
      vi.mocked(redis.del).mockResolvedValue(2);

      await invalidateStaticCache();
      expect(redis.smembers).toHaveBeenCalledWith('static:__index');
      expect(redis.del).toHaveBeenCalledWith(
        'static:zones:all',
        'static:mobs:zone:z1',
        'static:__index',
      );
    });

    it('does nothing when index set is empty', async () => {
      vi.mocked(redis.smembers).mockResolvedValue([]);
      await invalidateStaticCache();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
