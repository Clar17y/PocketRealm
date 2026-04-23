export const SEASON_STATUSES = {
  UPCOMING: 'upcoming',
  ACTIVE: 'active',
  ENDED: 'ended',
  ARCHIVED: 'archived',
} as const;

export type SeasonStatus = (typeof SEASON_STATUSES)[keyof typeof SEASON_STATUSES];

export const CACHED_SEASON_STATUSES: readonly SeasonStatus[] = [
  SEASON_STATUSES.ACTIVE,
  SEASON_STATUSES.ENDED,
];

export const SEASON_CACHE_TTL_MS = 60_000;
