import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../redis', () => ({
  redis: {
    get: vi.fn(),
    ttl: vi.fn(),
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
  clearStaticMemoryCache,
  invalidateStaticCache,
} from '../staticDataCacheService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as unknown as Record<string, any>;

const ZONE_A = { id: 'z1', name: 'Forest', difficulty: 1, zoneType: 'wild', isStarter: false };
const MOB_A = { id: 'm1', name: 'Rat', zoneId: 'z1', level: 1, hp: 20 };
const TEST_DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/pocketrealm_support_pocketrealm';
const TEST_NAMESPACE = 'pocketrealm_support_pocketrealm';
const originalDatabaseUrl = process.env.DATABASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  clearStaticMemoryCache();
  process.env.DATABASE_URL = TEST_DATABASE_URL;
});

afterEach(() => {
  process.env.DATABASE_URL = originalDatabaseUrl;
});

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

    it('serves repeated reads from process memory without Redis commands', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(redis.sadd).mockResolvedValue(1);
      db.zone.findMany.mockResolvedValue([ZONE_A]);

      await getCachedZones();
      vi.clearAllMocks();

      const result = await getCachedZones();

      expect(result).toEqual([ZONE_A]);
      expect(redis.get).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.sadd).not.toHaveBeenCalled();
      expect(db.zone.findMany).not.toHaveBeenCalled();
    });

    it('does not let process memory outlive the Redis TTL on cache hits', async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-06-26T08:00:00.000Z'));
        vi.mocked(redis.get).mockResolvedValue(JSON.stringify([ZONE_A]));
        vi.mocked(redis.ttl).mockResolvedValue(1);

        await getCachedZones();

        vi.clearAllMocks();
        vi.mocked(redis.get).mockResolvedValue(JSON.stringify([ZONE_A]));
        vi.mocked(redis.ttl).mockResolvedValue(1);
        vi.setSystemTime(new Date('2026-06-26T08:00:01.500Z'));

        const result = await getCachedZones();

        expect(result).toEqual([ZONE_A]);
        expect(redis.get).toHaveBeenCalledTimes(1);
        expect(db.zone.findMany).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('namespaces cache keys by database name', async () => {
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockResolvedValue('OK');
      vi.mocked(redis.sadd).mockResolvedValue(1);
      db.zone.findMany.mockResolvedValue([ZONE_A]);

      await getCachedZones();

      expect(redis.get).toHaveBeenCalledWith(`static:${TEST_NAMESPACE}:zones:all`);
      expect(redis.set).toHaveBeenCalledWith(
        `static:${TEST_NAMESPACE}:zones:all`,
        expect.any(String),
        'EX',
        86400,
      );
      expect(redis.sadd).toHaveBeenCalledWith(
        `static:${TEST_NAMESPACE}:__index`,
        `static:${TEST_NAMESPACE}:zones:all`,
      );
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
        `static:${TEST_NAMESPACE}:mobs:zone:z1`,
        expect.any(String),
        'EX',
        86400,
      );
    });
  });

  describe('invalidateStaticCache', () => {
    it('deletes all tracked static cache keys', async () => {
      vi.mocked(redis.smembers).mockResolvedValue([
        `static:${TEST_NAMESPACE}:zones:all`,
        `static:${TEST_NAMESPACE}:mobs:zone:z1`,
      ]);
      vi.mocked(redis.del).mockResolvedValue(2);

      await invalidateStaticCache();
      expect(redis.smembers).toHaveBeenCalledWith(`static:${TEST_NAMESPACE}:__index`);
      expect(redis.del).toHaveBeenCalledWith(
        `static:${TEST_NAMESPACE}:zones:all`,
        `static:${TEST_NAMESPACE}:mobs:zone:z1`,
        `static:${TEST_NAMESPACE}:__index`,
      );
    });

    it('does nothing when index set is empty', async () => {
      vi.mocked(redis.smembers).mockResolvedValue([]);
      await invalidateStaticCache();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });
});
