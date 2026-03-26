import { prisma } from '@pocketrealm/database';
import { cachedQuery, invalidateCache } from './cacheService';

const ZONE_CACHE_TTL = 60; // seconds
const zoneIdCacheKey = (playerId: string) => `player:zone:${playerId}`;

export async function getPlayerZoneId(playerId: string): Promise<string | null> {
  return cachedQuery(
    zoneIdCacheKey(playerId),
    async () => {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { currentZoneId: true },
      });
      return player?.currentZoneId ?? null;
    },
    ZONE_CACHE_TTL,
  );
}

export async function invalidateZoneIdCache(playerId: string): Promise<void> {
  await invalidateCache(zoneIdCacheKey(playerId));
}
