import { isWeeklyLeaderboardWindow } from './weeklyLeaderboardJob';

export function msUntilNextWeeklyLeaderboardWindow(
  now = new Date(),
  { includeCurrentWindow = true }: { includeCurrentWindow?: boolean } = {},
): number {
  if (includeCurrentWindow && isWeeklyLeaderboardWindow(now)) {
    return 0;
  }

  const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7;
  const nextMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilMonday,
  ));

  return Math.max(0, nextMonday.getTime() - now.getTime());
}
