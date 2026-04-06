import { prisma } from '@pocketrealm/database';
import { CACHE_TTL_CONSTANTS } from '@pocketrealm/shared';
import { cachedQuery, invalidateCache } from './cacheService';

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
    CACHE_TTL_CONSTANTS.PLAYER_ZONE_TTL,
  );
}

export async function invalidateZoneIdCache(playerId: string): Promise<void> {
  await invalidateCache(zoneIdCacheKey(playerId));
}

export async function teleportPlayer(playerId: string, zoneId: string): Promise<void> {
  await prisma.zone.findUniqueOrThrow({ where: { id: zoneId } });
  await prisma.player.update({
    where: { id: playerId },
    data: { currentZoneId: zoneId },
  });
  await invalidateZoneIdCache(playerId);
}
