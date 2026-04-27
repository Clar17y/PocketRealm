import { prisma } from '@pocketrealm/database';
import { CROWN_CONSTANTS, LEADERBOARD_CONSTANTS, SEASON_STATUSES } from '@pocketrealm/shared';
import { redis } from '../redis';
import { logger } from '../logger';
import { getIo } from '../socket';
import { emitSystemMessage } from '../services/systemMessageService';
import { awardCrownsForCategory } from '../services/crownService';
import { rebuildCrownCollectorSnapshot } from '../services/crownLeaderboardService';
import { getCategories, refreshAllLeaderboards } from '../services/leaderboardService';
import {
  leaderboardKey,
  leaderboardUtcMondayFor,
  leaderboardWeekKeyFor,
  leaderboardWeeklyDeltaKey,
  leaderboardWeeklyJobLockKey,
  leaderboardWeeklyJobRanKey,
  leaderboardWeeklySnapshotMarkerKey,
  leaderboardWeeklyStartKey,
  leaderboardWeeklyStartXpKey,
} from '../services/leaderboardKeys';
import { paginatedFindMany } from '../services/paginatedFindMany';

const CROWN_CATEGORIES = [...new Set(Object.values(CROWN_CONSTANTS.CATEGORY_GROUPS).flat())];

interface SkillSnapshotRow {
  id: string;
  playerId: string;
  skillType: string;
  xp: bigint;
}

interface PlayerXpSnapshotRow {
  id: string;
  characterXp: bigint;
}

export function isWeeklyLeaderboardWindow(now = new Date()): boolean {
  return now.getUTCDay() === 1 && now.getUTCHours() === 0 && now.getUTCMinutes() < 2;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function allLeaderboardCategories(): string[] {
  return getCategories().groups.flatMap((group) => group.categories.map((category) => category.slug));
}

async function activeLeaderboardRealms(): Promise<Array<string | null>> {
  const activeSeasons = await prisma.season.findMany({
    where: { status: SEASON_STATUSES.ACTIVE },
    select: { id: true },
  });

  return [null, ...activeSeasons.map((season) => season.id)];
}

async function awardRealmCrowns(
  seasonId: string | null,
  weekStart: Date,
): Promise<number> {
  const hasSnapshot = await redis.exists(leaderboardWeeklySnapshotMarkerKey(seasonId));
  if (!hasSnapshot) {
    return 0;
  }

  let crownCount = 0;
  for (const category of CROWN_CATEGORIES) {
    const winners = await awardCrownsForCategory(category, weekStart, seasonId);
    crownCount += winners.length;
  }

  return crownCount;
}

async function snapshotCategory(category: string, seasonId: string | null): Promise<void> {
  const startKey = leaderboardWeeklyStartKey(category, seasonId);
  await redis.del(startKey, leaderboardWeeklyDeltaKey(category, seasonId));

  try {
    await redis.copy(leaderboardKey(category, seasonId), startKey, 'REPLACE');
  } catch (err) {
    logger.debug({ err, category, seasonId }, 'Skipping weekly leaderboard snapshot for missing source key');
  }
}

async function writeSnapshotZset(
  key: string,
  entries: Array<{ playerId: string; score: number }>,
): Promise<void> {
  await redis.del(key);
  if (entries.length === 0) {
    return;
  }

  const args: Array<string | number> = [];
  for (const entry of entries) {
    args.push(entry.score, entry.playerId);
  }
  await redis.zadd(key, ...args);
}

async function snapshotXpCategories(seasonId: string | null): Promise<void> {
  const playerWhere = { isBot: false, seasonId: seasonId ?? null };
  const xpSnapshots = new Map<string, Array<{ playerId: string; score: number }>>();
  const skills = await paginatedFindMany<SkillSnapshotRow>(
    (args) => prisma.playerSkill.findMany(args as Parameters<typeof prisma.playerSkill.findMany>[0]) as unknown as Promise<SkillSnapshotRow[]>,
    {
      where: {
        player: playerWhere,
      },
      select: {
        id: true,
        playerId: true,
        skillType: true,
        xp: true,
      },
    },
  );

  const totalSkillXp = new Map<string, number>();
  for (const skill of skills) {
    const category = `skill_${skill.skillType}`;
    const entries = xpSnapshots.get(category) ?? [];
    entries.push({ playerId: skill.playerId, score: Number(skill.xp) });
    xpSnapshots.set(category, entries);
    totalSkillXp.set(skill.playerId, (totalSkillXp.get(skill.playerId) ?? 0) + Number(skill.xp));
  }

  const players = await paginatedFindMany<PlayerXpSnapshotRow>(
    (args) => prisma.player.findMany(args as Parameters<typeof prisma.player.findMany>[0]) as unknown as Promise<PlayerXpSnapshotRow[]>,
    {
      where: playerWhere,
      select: {
        id: true,
        characterXp: true,
      },
    },
  );

  xpSnapshots.set(
    'character_level',
    players.map((player) => ({ playerId: player.id, score: Number(player.characterXp) })),
  );
  xpSnapshots.set(
    'total_skill_level',
    Array.from(totalSkillXp.entries()).map(([playerId, score]) => ({ playerId, score })),
  );

  for (const category of CROWN_CONSTANTS.XP_BASED_CATEGORIES) {
    await writeSnapshotZset(
      leaderboardWeeklyStartXpKey(category, seasonId),
      xpSnapshots.get(category) ?? [],
    );
  }
}

async function snapshotRealm(seasonId: string | null, weekStart: Date): Promise<void> {
  await Promise.all(allLeaderboardCategories().map((category) => snapshotCategory(category, seasonId)));
  await snapshotXpCategories(seasonId);
  await redis.set(
    leaderboardWeeklySnapshotMarkerKey(seasonId),
    dateKey(weekStart),
    'EX',
    LEADERBOARD_CONSTANTS.WEEKLY_SNAPSHOT_MARKER_TTL_SECONDS,
  );
}

export async function runWeeklyLeaderboardJob(now = new Date()): Promise<void> {
  const currentWeekStart = leaderboardUtcMondayFor(now);
  const currentWeekKey = leaderboardWeekKeyFor(now);
  const jobKey = leaderboardWeeklyJobRanKey(currentWeekKey);
  if (await redis.get(jobKey)) {
    return;
  }

  const lockKey = leaderboardWeeklyJobLockKey(currentWeekKey);
  const acquiredLock = await redis.set(lockKey, '1', 'EX', LEADERBOARD_CONSTANTS.WEEKLY_JOB_LOCK_SECONDS, 'NX');
  if (acquiredLock !== 'OK') {
    return;
  }

  try {
    await refreshAllLeaderboards();

    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

    const realms = await activeLeaderboardRealms();
    let crownCount = 0;
    for (const seasonId of realms) {
      crownCount += await awardRealmCrowns(seasonId, previousWeekStart);
    }

    for (const seasonId of realms) {
      await snapshotRealm(seasonId, currentWeekStart);
    }

    if (crownCount > 0) {
      try {
        await rebuildCrownCollectorSnapshot();
      } catch (err) {
        logger.warn({ err }, 'Failed to rebuild crown collector snapshot after weekly crown awards');
      }
    }

    if (crownCount > 0) {
      await emitSystemMessage(
        getIo(),
        'world',
        'world',
        `Weekly crowns awarded! ${crownCount} crowns earned this week.`,
      );
    }

    await redis.set(jobKey, '1', 'EX', LEADERBOARD_CONSTANTS.WEEK_SECONDS);
    logger.info({ crownCount, realms: realms.length }, 'Weekly leaderboard crown job completed');
  } finally {
    await redis.del(lockKey);
  }
}
