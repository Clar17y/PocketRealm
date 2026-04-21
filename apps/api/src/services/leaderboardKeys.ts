const PERMANENT_LEADERBOARD_REALM_ID = 'permanent';

export function leaderboardRealmId(seasonId?: string | null): string {
  return seasonId ?? PERMANENT_LEADERBOARD_REALM_ID;
}

export function leaderboardKey(category: string, seasonId?: string | null): string {
  return `leaderboard:${leaderboardRealmId(seasonId)}:${category}`;
}

export function leaderboardMetaKey(category: string, seasonId?: string | null): string {
  return `leaderboard:meta:${leaderboardRealmId(seasonId)}:${category}`;
}
