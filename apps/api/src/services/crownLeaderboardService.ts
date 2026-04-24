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
const LOCK_WAIT_ATTEMPTS = 3;
const LOCK_WAIT_DELAY_MS = 10;
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

interface CollectorAggregate {
  playerId: string;
  username: string;
  characterLevel: number;
  activeTitle: string | null;
  crowns: CrownRankBreakdown;
  groups: Map<string, number>;
}

type CrownGroup = keyof typeof CROWN_CONSTANTS.CATEGORY_GROUPS;
type CrownSourceRow = Awaited<ReturnType<typeof readCrownRows>>[number];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isNumber(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isCrownBreakdown(value: unknown): value is CrownRankBreakdown {
  return isRecord(value) &&
    isNumber(value.gold) &&
    isNumber(value.silver) &&
    isNumber(value.bronze) &&
    isNumber(value.total);
}

function isTopGroup(value: unknown): value is { group: string; count: number } {
  return isRecord(value) &&
    typeof value.group === 'string' &&
    isNumber(value.count);
}

function isSnapshotEntry(value: unknown): value is CrownCollectorSnapshotEntry {
  return isRecord(value) &&
    typeof value.playerId === 'string' &&
    isNumber(value.rank) &&
    typeof value.username === 'string' &&
    isNumber(value.characterLevel) &&
    isOptionalString(value.title) &&
    isOptionalNumber(value.titleTier) &&
    isOptionalString(value.titleStyle) &&
    isCrownBreakdown(value.crowns) &&
    Array.isArray(value.topGroups) &&
    value.topGroups.every(isTopGroup);
}

function isSnapshot(value: unknown): value is CrownCollectorSnapshot {
  return isRecord(value) &&
    Array.isArray(value.entries) &&
    value.entries.every(isSnapshotEntry) &&
    isNumber(value.totalPlayers) &&
    typeof value.lastRefreshedAt === 'string';
}

function parseSnapshot(raw: string | null): CrownCollectorSnapshot | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isSnapshot(parsed) ? parsed : null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForSnapshot(): Promise<CrownCollectorSnapshot | null> {
  for (let attempt = 0; attempt < LOCK_WAIT_ATTEMPTS; attempt++) {
    await sleep(LOCK_WAIT_DELAY_MS);
    const snapshot = await readSnapshot();
    if (snapshot) {
      return snapshot;
    }
  }

  return null;
}

async function readCrownRows() {
  return prisma.playerCrown.findMany({
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
        },
      },
    },
    where: {
      player: { isBot: false },
    },
  });
}

export async function rebuildCrownCollectorSnapshot(): Promise<CrownCollectorSnapshot> {
  const rows = await readCrownRows();

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
      snapshot = await waitForSnapshot();
    }
  }

  if (!snapshot) {
    return { entries: [], myRank: null, totalPlayers: 0, lastRefreshedAt: null };
  }

  const mySnapshotRank = playerId
    ? snapshot.entries.find((entry) => entry.playerId === playerId) ?? null
    : null;
  const myIndex = mySnapshotRank ? mySnapshotRank.rank - 1 : -1;
  const centeredStart = Math.max(0, myIndex - Math.floor(pageSize / 2));
  const maxStart = Math.max(snapshot.entries.length - pageSize, 0);
  const start = aroundMe && myIndex >= 0 ? Math.min(centeredStart, maxStart) : 0;
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
