import { randomUUID } from 'crypto';
import { prisma } from '@pocketrealm/database';
import {
  CROWN_CONSTANTS,
  LEADERBOARD_CONSTANTS,
  resolveAchievementTitleDisplay,
  type TitleStyleVariant,
} from '@pocketrealm/shared';
import { redis } from '../redis';

const SNAPSHOT_KEY = 'leaderboard:crowns:lifetime:snapshot';
const LOCK_KEY = 'leaderboard:crowns:lifetime:refresh_lock';
const LOCK_TTL_MS = 30_000;
const RELEASE_LOCK_LUA = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export interface CrownRankBreakdown {
  gold: number;
  silver: number;
  bronze: number;
  total: number;
}

export interface CrownCollectorEntry {
  rank: number;
  username: string;
  characterLevel: number;
  title?: string;
  titleTier?: number;
  titleStyle?: TitleStyleVariant;
  crowns: CrownRankBreakdown;
  topGroups: Array<{ group: string; count: number }>;
}

export interface CrownCollectorResponse {
  entries: CrownCollectorEntry[];
  myRank: CrownCollectorEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

export interface CrownCollectorSnapshotEntry extends CrownCollectorEntry {
  playerId: string;
}

export interface CrownCollectorSnapshot {
  entries: CrownCollectorSnapshotEntry[];
  totalPlayers: number;
  lastRefreshedAt: string;
}

interface CrownSourceRow {
  playerId: string;
  category: string;
  rank: number;
  player: {
    username: string;
    characterLevel: number;
    isBot: boolean;
    activeTitle: string | null;
    account: { role: string };
  };
}

interface CollectorAggregate {
  playerId: string;
  username: string;
  characterLevel: number;
  activeTitle: string | null;
  crowns: CrownRankBreakdown;
  groups: Map<string, number>;
}

type CrownGroup = keyof typeof CROWN_CONSTANTS.CATEGORY_GROUPS;

function groupForCategory(category: string): string | null {
  for (const group of Object.keys(CROWN_CONSTANTS.CATEGORY_GROUPS) as CrownGroup[]) {
    if (CROWN_CONSTANTS.CATEGORY_GROUPS[group].includes(category)) {
      return group;
    }
  }

  return null;
}

function emptyBreakdown(): CrownRankBreakdown {
  return { gold: 0, silver: 0, bronze: 0, total: 0 };
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return LEADERBOARD_CONSTANTS.PAGE_SIZE;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), LEADERBOARD_CONSTANTS.PAGE_SIZE);
}

function toPublicEntry(entry: CrownCollectorSnapshotEntry): CrownCollectorEntry {
  return {
    rank: entry.rank,
    username: entry.username,
    characterLevel: entry.characterLevel,
    ...(entry.title ? { title: entry.title } : {}),
    ...(entry.titleTier !== undefined ? { titleTier: entry.titleTier } : {}),
    ...(entry.titleStyle ? { titleStyle: entry.titleStyle } : {}),
    crowns: entry.crowns,
    topGroups: entry.topGroups,
  };
}

function parseSnapshot(raw: string | null): CrownCollectorSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CrownCollectorSnapshot;
  } catch {
    return null;
  }
}

function addCrownToAggregate(aggregate: CollectorAggregate, row: CrownSourceRow): void {
  if (row.rank === CROWN_CONSTANTS.GOLD) {
    aggregate.crowns.gold++;
  } else if (row.rank === CROWN_CONSTANTS.SILVER) {
    aggregate.crowns.silver++;
  } else if (row.rank === CROWN_CONSTANTS.BRONZE) {
    aggregate.crowns.bronze++;
  } else {
    return;
  }

  aggregate.crowns.total++;

  const group = groupForCategory(row.category);
  if (group) {
    aggregate.groups.set(group, (aggregate.groups.get(group) ?? 0) + 1);
  }
}

function buildEntry(aggregate: CollectorAggregate, index: number): CrownCollectorSnapshotEntry {
  const topGroups = Array.from(aggregate.groups.entries())
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group))
    .slice(0, 3);

  return {
    playerId: aggregate.playerId,
    rank: index + 1,
    username: aggregate.username,
    characterLevel: aggregate.characterLevel,
    ...resolveAchievementTitleDisplay(aggregate.activeTitle),
    crowns: aggregate.crowns,
    topGroups,
  };
}

async function readSnapshot(): Promise<CrownCollectorSnapshot | null> {
  return parseSnapshot(await redis.get(SNAPSHOT_KEY));
}

export async function rebuildCrownCollectorSnapshot(): Promise<CrownCollectorSnapshot> {
  const rows = await prisma.playerCrown.findMany({
    select: {
      playerId: true,
      category: true,
      rank: true,
      player: {
        select: {
          username: true,
          characterLevel: true,
          isBot: true,
          activeTitle: true,
          account: { select: { role: true } },
        },
      },
    },
    where: {
      player: { isBot: false },
    },
  }) as CrownSourceRow[];

  const aggregates = new Map<string, CollectorAggregate>();
  for (const row of rows) {
    if (row.player.isBot) {
      continue;
    }

    let aggregate = aggregates.get(row.playerId);
    if (!aggregate) {
      aggregate = {
        playerId: row.playerId,
        username: row.player.username,
        characterLevel: row.player.characterLevel,
        activeTitle: row.player.activeTitle,
        crowns: emptyBreakdown(),
        groups: new Map(),
      };
      aggregates.set(row.playerId, aggregate);
    }

    addCrownToAggregate(aggregate, row);
  }

  const sorted = Array.from(aggregates.values())
    .filter((aggregate) => aggregate.crowns.total > 0)
    .sort((a, b) =>
      b.crowns.total - a.crowns.total ||
      b.crowns.gold - a.crowns.gold ||
      b.crowns.silver - a.crowns.silver ||
      b.crowns.bronze - a.crowns.bronze ||
      a.username.localeCompare(b.username));

  const snapshot: CrownCollectorSnapshot = {
    entries: sorted.map(buildEntry),
    totalPlayers: sorted.length,
    lastRefreshedAt: new Date().toISOString(),
  };

  await redis.set(SNAPSHOT_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export async function getCrownCollectorLeaderboard(
  playerId?: string,
  aroundMe = false,
  limit: number = LEADERBOARD_CONSTANTS.PAGE_SIZE,
): Promise<CrownCollectorResponse> {
  const pageSize = clampLimit(limit);
  let snapshot = await readSnapshot();

  if (!snapshot) {
    const lockToken = randomUUID();
    const acquired = await redis.set(LOCK_KEY, lockToken, 'PX', LOCK_TTL_MS, 'NX');
    if (acquired) {
      try {
        snapshot = await rebuildCrownCollectorSnapshot();
      } finally {
        await redis.eval(RELEASE_LOCK_LUA, 1, LOCK_KEY, lockToken);
      }
    } else {
      snapshot = await readSnapshot();
    }
  }

  if (!snapshot) {
    return { entries: [], myRank: null, totalPlayers: 0, lastRefreshedAt: null };
  }

  const mySnapshotRank = playerId
    ? snapshot.entries.find((entry) => entry.playerId === playerId) ?? null
    : null;
  const myIndex = mySnapshotRank ? mySnapshotRank.rank - 1 : -1;
  const start = aroundMe && myIndex >= 0
    ? Math.max(0, myIndex - Math.floor(pageSize / 2))
    : 0;
  const entries = snapshot.entries.slice(start, start + pageSize).map(toPublicEntry);

  return {
    entries,
    myRank: mySnapshotRank ? toPublicEntry(mySnapshotRank) : null,
    totalPlayers: snapshot.totalPlayers,
    lastRefreshedAt: snapshot.lastRefreshedAt,
  };
}

export async function getCachedCrownCollectorRows(limit: number): Promise<CrownCollectorEntry[]> {
  const snapshot = await readSnapshot();
  if (!snapshot) {
    return [];
  }

  return snapshot.entries.slice(0, clampLimit(limit)).map(toPublicEntry);
}

export async function invalidateCrownCollectorSnapshot(): Promise<void> {
  await redis.del(SNAPSHOT_KEY);
}
