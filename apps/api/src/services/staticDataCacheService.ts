import { prisma } from '@pocketrealm/database';
import { CACHE_TTL_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';

const TTL = CACHE_TTL_CONSTANTS.STATIC_DATA_TTL;

function getStaticCacheNamespace(): string {
  const databaseUrl = process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL ?? '';
  const fallback = 'default';

  if (!databaseUrl) return fallback;

  try {
    const dbName = new URL(databaseUrl).pathname.split('/').filter(Boolean).pop();
    if (!dbName) return fallback;
    return dbName.replace(/[^a-zA-Z0-9_-]/g, '_');
  } catch {
    return fallback;
  }
}

function getStaticCacheKey(key: string): string {
  return `static:${getStaticCacheNamespace()}:${key}`;
}

/**
 * Cache-through helper for static data. Like cachedQuery but also tracks
 * keys in a Redis Set so invalidateStaticCache can delete them without KEYS.
 */
async function staticCachedQuery<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const namespacedKey = getStaticCacheKey(key);
  const indexKey = getStaticCacheKey('__index');

  try {
    const cached = await redis.get(namespacedKey);
    if (cached !== null) return JSON.parse(cached) as T;
  } catch {
    // Redis unavailable — fall through
  }

  const result = await fetcher();

  try {
    await Promise.all([
      redis.set(namespacedKey, JSON.stringify(result), 'EX', TTL),
      redis.sadd(indexKey, namespacedKey),
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
  return staticCachedQuery('zones:all', () =>
    prisma.zone.findMany({
      orderBy: [{ isStarter: 'desc' }, { difficulty: 'asc' }, { name: 'asc' }],
    }),
  );
}

export function getCachedZoneConnections() {
  return staticCachedQuery('connections:all', () =>
    prisma.zoneConnection.findMany({
      select: { fromId: true, toId: true, explorationThreshold: true },
    }),
  );
}

// ---------------------------------------------------------------------------
// Mob Templates
// ---------------------------------------------------------------------------

export function getCachedMobTemplatesByZone(zoneId: string) {
  return staticCachedQuery(`mobs:zone:${zoneId}`, () =>
    prisma.mobTemplate.findMany({ where: { zoneId } }),
  );
}

export function getCachedBossMobTemplates() {
  return staticCachedQuery('mobs:boss', () =>
    prisma.mobTemplate.findMany({ where: { isBoss: true } }),
  );
}

export function getCachedExpeditionMobTemplates() {
  return staticCachedQuery('mobs:expedition', () =>
    prisma.mobTemplate.findMany({ where: { isExpeditionMob: true } }),
  );
}

// ---------------------------------------------------------------------------
// Resource Nodes
// ---------------------------------------------------------------------------

export function getCachedResourceNodesByZone(zoneId: string) {
  return staticCachedQuery(`resources:zone:${zoneId}`, () =>
    prisma.resourceNode.findMany({ where: { zoneId } }),
  );
}

// ---------------------------------------------------------------------------
// Zone Mob Families
// ---------------------------------------------------------------------------

export function getCachedZoneMobFamilies(zoneId: string) {
  return staticCachedQuery(`zonefamilies:${zoneId}`, () =>
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
  return staticCachedQuery('recipes:all', () =>
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
  const indexKey = getStaticCacheKey('__index');

  try {
    const keys = await redis.smembers(indexKey);
    if (keys.length === 0) return;
    await redis.del(...keys, indexKey);
  } catch {
    // Best-effort
  }
}
