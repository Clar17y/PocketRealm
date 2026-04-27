import { LEADERBOARD_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';
import { getCachedCrownCollectorRows, type CrownCollectorEntry } from './crownLeaderboardService';
import { leaderboardMetaKey, leaderboardWeeklyDeltaKey } from './leaderboardKeys';
import { getCategoryLabel, LEADERBOARD_LAST_REFRESH_KEY } from './leaderboardService';
import { parseLeaderboardMeta } from './leaderboardMeta';

const SUMMARY_CATEGORIES = ['character_xp', 'total_kills', 'pvp_rating', 'casino_profit'] as const;

export interface PublicSummaryWeeklyLeader {
  category: string;
  label: string;
  rank: number;
  username: string;
  characterLevel: number;
  score: number;
}

export interface PublicLeaderboardSummary {
  crownCollectors: CrownCollectorEntry[];
  weeklyLeaders: PublicSummaryWeeklyLeader[];
  lastRefreshedAt: string | null;
}

async function getWeeklyLeader(category: string): Promise<PublicSummaryWeeklyLeader | null> {
  const label = getCategoryLabel(category);
  if (!label) {
    return null;
  }

  const raw = await redis.zrevrange(
    leaderboardWeeklyDeltaKey(category, null),
    0,
    0,
    'WITHSCORES',
  );
  const playerId = raw[0];
  const score = Number(raw[1]);
  if (!playerId || !Number.isFinite(score)) {
    return null;
  }

  const [metaRaw] = await redis.hmget(leaderboardMetaKey(category, null), playerId);
  const meta = parseLeaderboardMeta(metaRaw);
  if (!meta?.username || meta.characterLevel === undefined) {
    return null;
  }

  return {
    category,
    label,
    rank: 1,
    username: meta.username,
    characterLevel: meta.characterLevel,
    score,
  };
}

export async function getPublicLeaderboardSummary(): Promise<PublicLeaderboardSummary> {
  const [crownCollectors, weeklyLeaderResults, lastRefreshedAt] = await Promise.all([
    getCachedCrownCollectorRows(LEADERBOARD_CONSTANTS.PUBLIC_SUMMARY_LIMIT),
    Promise.all(SUMMARY_CATEGORIES.map(getWeeklyLeader)),
    redis.get(LEADERBOARD_LAST_REFRESH_KEY),
  ]);

  return {
    crownCollectors,
    weeklyLeaders: weeklyLeaderResults.filter((leader): leader is PublicSummaryWeeklyLeader => leader !== null),
    lastRefreshedAt,
  };
}
