import { prisma, type Prisma } from '@pocketrealm/database';
import { CROWN_CONSTANTS } from '@pocketrealm/shared';
import { redis } from '../redis';
import { checkAchievements } from './achievementService';
import { leaderboardMetaKey, leaderboardRealmId, leaderboardWeeklyDeltaKey } from './leaderboardKeys';

interface DeltaEntry {
  playerId: string;
  score: number;
  isBot: boolean;
}

export interface CrownWinner {
  playerId: string;
  rank: number;
}

export interface CrownRankCounts {
  gold: number;
  silver: number;
  bronze: number;
}

export interface CrownCollectionEntry {
  category: string;
  realmId: string;
  rank: number;
  weekStart: string;
}

export interface CrownCollection {
  crowns: CrownCollectionEntry[];
  totalByGroup: Record<string, number>;
}

type CrownGroup = keyof typeof CROWN_CONSTANTS.CATEGORY_GROUPS;

function crownGroupForCategory(category: string): CrownGroup | null {
  for (const group of Object.keys(CROWN_CONSTANTS.CATEGORY_GROUPS) as CrownGroup[]) {
    if (CROWN_CONSTANTS.CATEGORY_GROUPS[group].includes(category)) {
      return group;
    }
  }

  return null;
}

function emptyRankCounts(): CrownRankCounts {
  return { gold: 0, silver: 0, bronze: 0 };
}

function parseLeaderboardMeta(raw: unknown): { isBot?: boolean } {
  if (typeof raw !== 'string') {
    return {};
  }

  try {
    return JSON.parse(raw) as { isBot?: boolean };
  } catch {
    return {};
  }
}

export function computeCrownWinners(deltas: DeltaEntry[]): CrownWinner[] {
  const eligible = deltas
    .filter((entry) => !entry.isBot && entry.score >= CROWN_CONSTANTS.MIN_DELTA)
    .sort((a, b) => b.score - a.score);

  const winners: CrownWinner[] = [];
  let currentRank = 0;
  let lastScore: number | null = null;

  for (const entry of eligible) {
    if (winners.length >= CROWN_CONSTANTS.MAX_CROWNS_PER_CATEGORY) break;

    if (entry.score !== lastScore) {
      currentRank = winners.length + 1;
      if (currentRank > CROWN_CONSTANTS.BRONZE) break;
    }

    winners.push({ playerId: entry.playerId, rank: currentRank });
    lastScore = entry.score;
  }

  return winners;
}

async function readCrownDeltas(category: string, seasonId?: string | null): Promise<DeltaEntry[]> {
  const entries: DeltaEntry[] = [];
  const pageSize = CROWN_CONSTANTS.AWARD_SCAN_PAGE_SIZE;
  const maxEntries = CROWN_CONSTANTS.AWARD_SCAN_MAX_ENTRIES;

  for (let start = 0; start < maxEntries; start += pageSize) {
    const stop = Math.min(start + pageSize - 1, maxEntries - 1);
    const raw = await redis.zrevrange(
      leaderboardWeeklyDeltaKey(category, seasonId),
      start,
      stop,
      'WITHSCORES',
    );

    if (raw.length === 0) {
      break;
    }

    const playerIds: string[] = [];
    const scores: number[] = [];
    for (let index = 0; index < raw.length; index += 2) {
      const playerId = raw[index];
      const score = raw[index + 1];
      if (!playerId || score === undefined) continue;
      playerIds.push(playerId);
      scores.push(Number(score));
    }

    const metaPipeline = redis.pipeline();
    for (const playerId of playerIds) {
      metaPipeline.hget(leaderboardMetaKey(category, seasonId), playerId);
    }
    const metaResults = await metaPipeline.exec();

    for (let index = 0; index < playerIds.length; index++) {
      const meta = parseLeaderboardMeta(metaResults?.[index]?.[1]);
      entries.push({
        playerId: playerIds[index],
        score: scores[index] ?? 0,
        isBot: meta.isBot ?? false,
      });
    }

    if (computeCrownWinners(entries).length >= CROWN_CONSTANTS.MAX_CROWNS_PER_CATEGORY) {
      break;
    }
  }

  return entries;
}

export async function awardCrownsForCategory(
  category: string,
  weekStart: Date,
  seasonId?: string | null,
): Promise<CrownWinner[]> {
  const winners = computeCrownWinners(await readCrownDeltas(category, seasonId));
  if (winners.length === 0) {
    return [];
  }

  const realmId = leaderboardRealmId(seasonId);
  const insertedCrowns = await prisma.playerCrown.createManyAndReturn({
    data: winners.map((winner) => ({
      playerId: winner.playerId,
      category,
      realmId,
      rank: winner.rank,
      weekStart,
    })),
    skipDuplicates: true,
  });
  const insertedWinners = insertedCrowns.map((crown) => ({
    playerId: crown.playerId,
    rank: crown.rank,
  }));
  if (insertedWinners.length === 0) {
    return [];
  }

  const group = crownGroupForCategory(category);
  if (group) {
    await Promise.all(insertedWinners.map((winner) =>
      checkAchievements(winner.playerId, { statKeys: [`crowns_${group}`] }).catch(() => []),
    ));
  }

  return insertedWinners;
}

export async function getCrownCountsForCategory(
  category: string,
  playerIds: string[],
): Promise<Map<string, CrownRankCounts>> {
  if (playerIds.length === 0) {
    return new Map();
  }

  const counts = await prisma.playerCrown.groupBy({
    by: ['playerId', 'rank'],
    where: {
      category,
      playerId: { in: playerIds },
    },
    _count: { id: true },
  });

  const result = new Map<string, CrownRankCounts>();
  for (const count of counts) {
    const existing = result.get(count.playerId) ?? emptyRankCounts();
    if (count.rank === CROWN_CONSTANTS.GOLD) {
      existing.gold = count._count.id;
    } else if (count.rank === CROWN_CONSTANTS.SILVER) {
      existing.silver = count._count.id;
    } else if (count.rank === CROWN_CONSTANTS.BRONZE) {
      existing.bronze = count._count.id;
    }
    result.set(count.playerId, existing);
  }

  return result;
}

export async function getPlayerCrownCollection(playerId: string): Promise<CrownCollection> {
  const crowns = await prisma.playerCrown.findMany({
    where: { playerId },
    select: {
      category: true,
      realmId: true,
      rank: true,
      weekStart: true,
    },
    orderBy: { weekStart: 'desc' },
  });

  const totalByGroup: Record<string, number> = {};
  for (const group of Object.keys(CROWN_CONSTANTS.CATEGORY_GROUPS) as CrownGroup[]) {
    totalByGroup[group] = 0;
  }
  for (const crown of crowns) {
    const group = crownGroupForCategory(crown.category);
    if (group) {
      totalByGroup[group]++;
    }
  }

  return {
    crowns: crowns.map((crown) => ({
      category: crown.category,
      realmId: crown.realmId,
      rank: crown.rank,
      weekStart: crown.weekStart.toISOString().slice(0, 10),
    })),
    totalByGroup,
  };
}

export async function transferCrownsToPlayerTx(
  tx: Prisma.TransactionClient,
  fromPlayerId: string,
  toPlayerId: string,
): Promise<number> {
  const crowns = await tx.playerCrown.findMany({
    where: { playerId: fromPlayerId },
    select: {
      category: true,
      realmId: true,
      rank: true,
      weekStart: true,
      awardedAt: true,
    },
  });

  if (crowns.length === 0) {
    return 0;
  }

  const created = await tx.playerCrown.createMany({
    data: crowns.map((crown) => ({
      playerId: toPlayerId,
      category: crown.category,
      realmId: crown.realmId,
      rank: crown.rank,
      weekStart: crown.weekStart,
      awardedAt: crown.awardedAt,
    })),
    skipDuplicates: true,
  });

  return created.count;
}
