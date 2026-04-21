import { prisma } from '@pocketrealm/database';
import { CACHED_SEASON_STATUSES, SEASON_CACHE_TTL_MS } from './season.constants';

export interface CachedSeason {
  id: string;
  name: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  constantOverrides: Record<string, Record<string, number>> | null;
  features: string[];
}

let seasonCache = new Map<string, CachedSeason>();
let lastRefreshedAtMs = 0;

export async function refreshSeasonCache(): Promise<void> {
  const seasons = await prisma.season.findMany({
    where: { status: { in: [...CACHED_SEASON_STATUSES] } },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      constantOverrides: true,
      features: true,
    },
  });

  const nextCache = new Map<string, CachedSeason>();
  for (const season of seasons) {
    nextCache.set(season.id, {
      id: season.id,
      name: season.name,
      status: season.status,
      startsAt: season.startsAt,
      endsAt: season.endsAt,
      constantOverrides: season.constantOverrides as Record<string, Record<string, number>> | null,
      features: Array.isArray(season.features) ? season.features.filter((feature): feature is string => typeof feature === 'string') : [],
    });
  }

  seasonCache = nextCache;
  lastRefreshedAtMs = Date.now();
}

export function getCachedSeason(seasonId: string): CachedSeason | undefined {
  return seasonCache.get(seasonId);
}

export function isSeasonCacheStale(): boolean {
  return Date.now() - lastRefreshedAtMs > SEASON_CACHE_TTL_MS;
}

export function getActiveSeason(): CachedSeason | undefined {
  for (const season of seasonCache.values()) {
    if (season.status === 'active') {
      return season;
    }
  }

  return undefined;
}
