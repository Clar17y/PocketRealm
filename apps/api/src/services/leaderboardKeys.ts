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

export function leaderboardWeeklyStartKey(category: string, seasonId?: string | null): string {
  return `leaderboard:weekly_start:${leaderboardRealmId(seasonId)}:${category}`;
}

export function leaderboardWeeklyStartXpKey(category: string, seasonId?: string | null): string {
  return `leaderboard:weekly_start_xp:${leaderboardRealmId(seasonId)}:${category}`;
}

export function leaderboardWeeklyDeltaKey(category: string, seasonId?: string | null): string {
  return `leaderboard:weekly_delta:${leaderboardRealmId(seasonId)}:${category}`;
}

export function leaderboardWeeklySnapshotMarkerKey(seasonId?: string | null): string {
  return `leaderboard:weekly_snapshot:${leaderboardRealmId(seasonId)}`;
}

export function leaderboardWeeklyJobLockKey(weekKey: string): string {
  return `leaderboard:weekly_job_lock:${weekKey}`;
}

export function leaderboardWeeklyJobRanKey(weekKey: string): string {
  return `leaderboard:weekly_job_ran:${weekKey}`;
}

export function leaderboardUtcMondayFor(now: Date): Date {
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
  ));
}

export function leaderboardWeekKeyFor(now: Date): string {
  return leaderboardUtcMondayFor(now).toISOString().slice(0, 10);
}
