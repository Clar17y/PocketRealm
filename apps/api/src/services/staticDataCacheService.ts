import { prisma } from '@pocketrealm/database';
import { CACHE_TTL_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';

const TTL = CACHE_TTL_CONSTANTS.STATIC_DATA_TTL;
const INDEX_KEY = 'static:__index';

/**
 * Cache-through helper for static data. Like cachedQuery but also tracks
 * keys in a Redis Set so invalidateStaticCache can delete them without KEYS.
 */
async function staticCachedQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through
  }

  const result = await fetcher();

  try {
    await Promise.all([
      redis.set(key, JSON.stringify(result), 'EX', TTL),
      redis.sadd(INDEX_KEY, key),
    ]);
  } catch {
    // Best-effort
  }

  return result;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

export function getCachedZones() {
  return staticCachedQuery('static:zones:all', () =>
    prisma.zone.findMany({
      orderBy: [{ isStarter: 'desc' }, { difficulty: 'asc' }, { name: 'asc' }],
    }),
  );
}

export function getCachedZoneConnections() {
  return staticCachedQuery('static:connections:all', () =>
    prisma.zoneConnection.findMany({
      select: { fromId: true, toId: true, explorationThreshold: true },
    }),
  );
}

// ---------------------------------------------------------------------------
// Mob Templates
// ---------------------------------------------------------------------------

export function getCachedMobTemplatesByZone(zoneId: string) {
  return staticCachedQuery(`static:mobs:zone:${zoneId}`, () =>
    prisma.mobTemplate.findMany({ where: { zoneId } }),
  );
}

export function getCachedBossMobTemplates() {
  return staticCachedQuery('static:mobs:boss', () =>
    prisma.mobTemplate.findMany({ where: { isBoss: true } }),
  );
}

export function getCachedExpeditionMobTemplates() {
  return staticCachedQuery('static:mobs:expedition', () =>
    prisma.mobTemplate.findMany({ where: { isExpeditionMob: true } }),
  );
}

// ---------------------------------------------------------------------------
// Resource Nodes
// ---------------------------------------------------------------------------

export function getCachedResourceNodesByZone(zoneId: string) {
  return staticCachedQuery(`static:resources:zone:${zoneId}`, () =>
    prisma.resourceNode.findMany({ where: { zoneId } }),
  );
}

// ---------------------------------------------------------------------------
// Zone Mob Families
// ---------------------------------------------------------------------------

export function getCachedZoneMobFamilies(zoneId: string) {
  return staticCachedQuery(`static:zonefamilies:${zoneId}`, () =>
    prisma.zoneMobFamily.findMany({
      where: { zoneId },
      include: {
        mobFamily: {
          include: {
            members: {
              include: {
                mobTemplate: {
                  select: { id: true, name: true, zoneId: true, explorationTier: true },
                },
              },
            },
          },
        },
      },
    }),
  );
}

// ---------------------------------------------------------------------------
// Crafting Recipes
// ---------------------------------------------------------------------------

export function getCachedCraftingRecipes() {
  return staticCachedQuery('static:recipes:all', () =>
    prisma.craftingRecipe.findMany({
      include: { resultTemplate: true, mobFamily: { select: { name: true, siteNounLarge: true } } },
      orderBy: [{ requiredLevel: 'asc' }],
    }),
  );
}

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

export async function invalidateStaticCache(): Promise<void> {
  try {
    const keys = await redis.smembers(INDEX_KEY);
    if (keys.length === 0) return;
    await redis.del(...keys, INDEX_KEY);
  } catch {
    // Best-effort
  }
}
