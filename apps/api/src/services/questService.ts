import { prisma } from '@pocketrealm/database';
import {
  QUEST_TEMPLATE_DEFINITIONS,
  QUEST_CONSTANTS,
  PVP_CONSTANTS,
  getAllMobPrefixes,
  type ProgressType,
  type QuestTemplateDefinition,
  type PlayerQuestData,
  type PlayerQuestStateData,
  type QuestProgressUpdate,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { getDayStart, getWeekStart, getNextDayStart, getWeekEnd, getLevelBracket, selectWithCategorySpread } from '../utils/dateHelpers';
import { randomIntInclusive } from '../utils/random';

// ---------------------------------------------------------------------------
// Unlock condition checks
// ---------------------------------------------------------------------------

async function getEligibleTemplates(
  playerId: string,
  playerLevel: number,
  cadence: 'daily' | 'weekly',
): Promise<QuestTemplateDefinition[]> {
  const allDefs = QUEST_TEMPLATE_DEFINITIONS.filter((d) => d.cadence === cadence);

  // Determine which unlock conditions are met
  const hasUnlock = new Set<string>();

  // PvP: requires minimum character level
  if (playerLevel >= PVP_CONSTANTS.MIN_CHARACTER_LEVEL) {
    hasUnlock.add('pvp_unlocked');
  }

  // Casino: always accessible (town-gated at use time, not assignment)
  hasUnlock.add('casino_accessible');

  // Multi-zone: requires 2+ discovered zones
  const zoneCount = await prisma.playerZoneDiscovery.count({ where: { playerId } });
  if (zoneCount >= 2) {
    hasUnlock.add('multi_zone');
  }

  // Prefix kills: requires at least 1 prefix encounter
  const hasPrefix = await prisma.playerBestiaryPrefix.findFirst({
    where: { playerId },
    select: { playerId: true },
  });
  if (hasPrefix) {
    hasUnlock.add('has_prefix_kills');
  }

  return allDefs.filter((d) => !d.unlockCondition || hasUnlock.has(d.unlockCondition));
}

/** Map from questKey → QuestTemplateDefinition for fast lookup. */
const TEMPLATE_BY_KEY = new Map<string, QuestTemplateDefinition>(
  QUEST_TEMPLATE_DEFINITIONS.map((d) => [d.key, d]),
);

/** Map a DB row to the PlayerQuestData API shape. */
function toQuestData(row: {
  id: string;
  questKey: string;
  cadence: string;
  targetValue: number;
  currentValue: number;
  rewardAmount: number;
  status: string;
  filterValue: string | null;
  assignedAt: Date;
  expiresAt: Date;
  completedAt: Date | null;
  claimedAt: Date | null;
}): PlayerQuestData {
  const def = TEMPLATE_BY_KEY.get(row.questKey);
  return {
    id: row.id,
    questKey: row.questKey,
    name: (def?.name ?? row.questKey)
      .replace('{prefix}', row.filterValue ?? ''),
    description: (def?.description ?? '')
      .replace('{target}', String(row.targetValue))
      .replace('{prefix}', row.filterValue ?? ''),
    category: def?.category ?? 'combat',
    cadence: row.cadence as 'daily' | 'weekly',
    targetValue: row.targetValue,
    currentValue: row.currentValue,
    rewardAmount: row.rewardAmount,
    status: row.status as 'active' | 'completed' | 'claimed',
    assignedAt: row.assignedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    claimedAt: row.claimedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// getOrCreateQuestState
// ---------------------------------------------------------------------------

export async function getOrCreateQuestState(playerId: string) {
  return prisma.playerQuestState.upsert({
    where: { playerId },
    create: {
      playerId,
      questTokens: 0,
      dailyBonusClaimed: false,
      lastDailyReset: new Date('2000-01-01T00:00:00Z'),
      lastWeeklyReset: new Date('2000-01-01T00:00:00Z'),
    },
    update: {},
  });
}

// ---------------------------------------------------------------------------
// getActiveQuests (lazy generation)
// ---------------------------------------------------------------------------

export async function getActiveQuests(
  playerId: string,
  now: Date = new Date(),
): Promise<PlayerQuestData[]> {
  const state = await getOrCreateQuestState(playerId);
  const todayStart = getDayStart(now);
  const weekStart = getWeekStart(now);

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { characterLevel: true },
  });
  const playerLevel = player?.characterLevel ?? 1;

  // Daily reset check — claim the reset timestamp first to prevent concurrent generation
  const needsDailyReset = state.lastDailyReset < todayStart;
  if (needsDailyReset) {
    // Optimistic lock: update timestamp first so concurrent calls skip generation
    const { count } = await prisma.playerQuestState.updateMany({
      where: { playerId, lastDailyReset: { lt: todayStart } },
      data: { lastDailyReset: todayStart, dailyBonusClaimed: false, rerollsUsed: 0 },
    });

    if (count > 0) {
      // We won the race — expire old and generate new
      await prisma.playerQuest.updateMany({
        where: { playerId, cadence: 'daily', status: { in: ['active', 'completed'] } },
        data: { status: 'expired' },
      });
      await generateDailyQuests(playerId, playerLevel, now);
    }
  }

  // Weekly reset check — same optimistic lock pattern
  const needsWeeklyReset = state.lastWeeklyReset < weekStart;
  if (needsWeeklyReset) {
    const { count } = await prisma.playerQuestState.updateMany({
      where: { playerId, lastWeeklyReset: { lt: weekStart } },
      data: { lastWeeklyReset: weekStart },
    });

    if (count > 0) {
      await prisma.playerQuest.updateMany({
        where: { playerId, cadence: 'weekly', status: { in: ['active', 'completed'] } },
        data: { status: 'expired' },
      });
      await generateWeeklyQuest(playerId, playerLevel, now);
    }
  }

  // Return active + completed + claimed quests from the current period only
  const quests = await prisma.playerQuest.findMany({
    where: {
      playerId,
      status: { in: ['active', 'completed', 'claimed'] },
      expiresAt: { gt: now },
    },
    orderBy: { assignedAt: 'desc' },
  });

  return quests.map(toQuestData);
}

// ---------------------------------------------------------------------------
// generateDailyQuests
// ---------------------------------------------------------------------------

export async function generateDailyQuests(
  playerId: string,
  playerLevel: number,
  now: Date = new Date(),
): Promise<PlayerQuestData[]> {
  const { DAILY_COUNT, MIN_DAILY_CATEGORIES } = QUEST_CONSTANTS;
  const bracket = getLevelBracket(playerLevel);
  const expiresAt = getNextDayStart(now);

  const eligible = await getEligibleTemplates(playerId, playerLevel, 'daily');
  const selected = selectWithCategorySpread(eligible, DAILY_COUNT, MIN_DAILY_CATEGORIES);

  // Create quest rows
  const created: PlayerQuestData[] = [];
  for (const def of selected) {
    const targetValue = def.targets[bracket];
    const [rewardMin, rewardMax] = def.rewards[bracket];
    const rewardAmount = randomIntInclusive(rewardMin, rewardMax);

    // For prefix filter quests, pick a random prefix from the mob prefix definitions
    let filterValue: string | null = null;
    if (def.filter === 'prefix') {
      const prefixes = getAllMobPrefixes();
      filterValue = prefixes[Math.floor(Math.random() * prefixes.length)]!.key;
    }

    const row = await prisma.playerQuest.create({
      data: {
        playerId,
        questKey: def.key,
        cadence: 'daily',
        targetValue,
        currentValue: 0,
        rewardAmount,
        status: 'active',
        filterValue,
        expiresAt,
      },
    });

    created.push(toQuestData(row));
  }

  return created;
}

// ---------------------------------------------------------------------------
// generateWeeklyQuest
// ---------------------------------------------------------------------------

export async function generateWeeklyQuest(
  playerId: string,
  playerLevel: number,
  now: Date = new Date(),
): Promise<PlayerQuestData[]> {
  const bracket = getLevelBracket(playerLevel);
  const expiresAt = getWeekEnd(getWeekStart(now));

  const eligible = await getEligibleTemplates(playerId, playerLevel, 'weekly');
  if (eligible.length === 0) return [];
  const def = eligible[Math.floor(Math.random() * eligible.length)]!;

  const targetValue = def.targets[bracket];
  const [rewardMin, rewardMax] = def.rewards[bracket];
  const rewardAmount = randomIntInclusive(rewardMin, rewardMax);

  const row = await prisma.playerQuest.create({
    data: {
      playerId,
      questKey: def.key,
      cadence: 'weekly',
      targetValue,
      currentValue: 0,
      rewardAmount,
      status: 'active',
      filterValue: null,
      expiresAt,
    },
  });

  return [toQuestData(row)];
}

// ---------------------------------------------------------------------------
// incrementQuestProgress
// ---------------------------------------------------------------------------

export async function incrementQuestProgress(
  playerId: string,
  type: ProgressType,
  amount: number,
  metadata?: { prefix?: string },
): Promise<QuestProgressUpdate[]> {
  if (amount <= 0) return [];

  // Find all active quests for this player
  const activeQuests = await prisma.playerQuest.findMany({
    where: { playerId, status: 'active' },
  });

  const updates: QuestProgressUpdate[] = [];

  for (const quest of activeQuests) {
    const def = TEMPLATE_BY_KEY.get(quest.questKey);
    if (!def || def.progressType !== type) continue;

    // Prefix filter matching: if the quest has a filterValue (prefix filter),
    // only count kills with that specific prefix
    if (def.filter === 'prefix' && quest.filterValue) {
      if (!metadata?.prefix || metadata.prefix !== quest.filterValue) continue;
    }

    // Atomic increment prevents stale-read data loss from concurrent requests
    const updated = await prisma.playerQuest.update({
      where: { id: quest.id },
      data: { currentValue: { increment: amount } },
    });

    const newValue = Math.min(updated.currentValue, quest.targetValue);
    const completed = updated.currentValue >= quest.targetValue;

    if (completed) {
      // Atomic status transition — updateMany guard prevents duplicate completion
      await prisma.playerQuest.updateMany({
        where: { id: quest.id, status: 'active' },
        data: { currentValue: quest.targetValue, status: 'completed', completedAt: new Date() },
      });
    }

    updates.push({
      questId: quest.id,
      questName: def.name,
      current: newValue,
      target: quest.targetValue,
      completed,
    });
  }

  return updates;
}

// ---------------------------------------------------------------------------
// claimQuestReward
// ---------------------------------------------------------------------------

export async function claimQuestReward(
  playerId: string,
  questId: string,
): Promise<{ tokensAwarded: number; newBalance: number }> {
  return prisma.$transaction(async (tx) => {
    const quest = await tx.playerQuest.findFirst({
      where: { id: questId, playerId, status: 'completed' },
    });

    if (!quest) {
      throw new AppError(400, 'Quest not found or not completed', 'QUEST_NOT_CLAIMABLE');
    }

    // Set quest to claimed
    await tx.playerQuest.update({
      where: { id: questId },
      data: { status: 'claimed', claimedAt: new Date() },
    });

    // Award tokens
    const updated = await tx.playerQuestState.update({
      where: { playerId },
      data: { questTokens: { increment: quest.rewardAmount } },
    });

    return { tokensAwarded: quest.rewardAmount, newBalance: updated.questTokens };
  });
}

// ---------------------------------------------------------------------------
// claimDailyBonus
// ---------------------------------------------------------------------------

export async function claimDailyBonus(
  playerId: string,
  now: Date = new Date(),
): Promise<{ tokensAwarded: number; newBalance: number }> {
  const state = await getOrCreateQuestState(playerId);

  if (state.dailyBonusClaimed) {
    throw new AppError(400, 'Daily bonus already claimed', 'ALREADY_CLAIMED');
  }

  // Check that all daily quests for today are claimed
  const todayStart = getDayStart(now);
  const totalDailies = await prisma.playerQuest.count({
    where: { playerId, cadence: 'daily', assignedAt: { gte: todayStart } },
  });

  if (totalDailies === 0) {
    throw new AppError(400, 'No daily quests assigned yet', 'NO_DAILIES');
  }

  const claimedDailies = await prisma.playerQuest.count({
    where: { playerId, cadence: 'daily', assignedAt: { gte: todayStart }, status: 'claimed' },
  });

  if (claimedDailies < totalDailies) {
    throw new AppError(400, 'Not all daily quests are claimed', 'INCOMPLETE_DAILIES');
  }

  // Compute bonus
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { characterLevel: true },
  });
  const level = player?.characterLevel ?? 1;
  const { DAILY_BONUS_BASE, DAILY_BONUS_PER_LEVEL } = QUEST_CONSTANTS;
  const bonusTokens = DAILY_BONUS_BASE + Math.floor(level * DAILY_BONUS_PER_LEVEL);

  // Atomic claim — updateMany with dailyBonusClaimed guard prevents double claim via TOCTOU
  const { count } = await prisma.playerQuestState.updateMany({
    where: { playerId, dailyBonusClaimed: false },
    data: {
      dailyBonusClaimed: true,
      questTokens: { increment: bonusTokens },
    },
  });
  if (count === 0) {
    throw new AppError(400, 'Daily bonus already claimed', 'ALREADY_CLAIMED');
  }

  const updated = await prisma.playerQuestState.findUniqueOrThrow({ where: { playerId } });
  return { tokensAwarded: bonusTokens, newBalance: updated.questTokens };
}

// ---------------------------------------------------------------------------
// getQuestState
// ---------------------------------------------------------------------------

export async function getQuestState(playerId: string): Promise<PlayerQuestStateData> {
  const state = await getOrCreateQuestState(playerId);
  return {
    questTokens: state.questTokens,
    dailyBonusClaimed: state.dailyBonusClaimed,
    rerollsUsed: state.rerollsUsed,
    lastDailyReset: state.lastDailyReset.toISOString(),
    lastWeeklyReset: state.lastWeeklyReset.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// rerollQuest
// ---------------------------------------------------------------------------

export async function rerollQuest(
  playerId: string,
  questId: string,
  now: Date = new Date(),
): Promise<PlayerQuestData> {
  // Find the quest to reroll — must be active
  const quest = await prisma.playerQuest.findFirst({
    where: { id: questId, playerId, status: 'active' },
  });
  if (!quest) throw new AppError(400, 'Quest not found or not active', 'QUEST_NOT_ACTIVE');

  // Get player level for bracket
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { characterLevel: true },
  });
  const playerLevel = player?.characterLevel ?? 1;
  const bracket = getLevelBracket(playerLevel);

  // Get eligible templates excluding already-assigned quest keys
  const periodStart = quest.cadence === 'weekly' ? getWeekStart(now) : getDayStart(now);
  const currentQuests = await prisma.playerQuest.findMany({
    where: { playerId, cadence: quest.cadence, status: { not: 'expired' }, assignedAt: { gte: periodStart } },
    select: { questKey: true },
  });
  const currentKeys = new Set(currentQuests.map(q => q.questKey));

  const eligible = await getEligibleTemplates(playerId, playerLevel, quest.cadence as 'daily' | 'weekly');
  const available = eligible.filter(d => !currentKeys.has(d.key));

  if (available.length === 0) {
    throw new AppError(400, 'No alternative quests available', 'NO_ALTERNATIVES');
  }

  // Pick a random replacement
  const newDef = available[Math.floor(Math.random() * available.length)]!;
  const targetValue = newDef.targets[bracket];
  const [rewardMin, rewardMax] = newDef.rewards[bracket];
  const rewardAmount = randomIntInclusive(rewardMin, rewardMax);

  let filterValue: string | null = null;
  if (newDef.filter === 'prefix') {
    const prefixes = getAllMobPrefixes();
    filterValue = prefixes[Math.floor(Math.random() * prefixes.length)]!.key;
  }

  // All DB writes in one transaction with reroll guard inside
  const newQuest = await prisma.$transaction(async (tx) => {
    // Check reroll limit inside transaction to prevent TOCTOU race
    const state = await tx.playerQuestState.findUnique({ where: { playerId } });
    if (!state || state.rerollsUsed >= QUEST_CONSTANTS.REROLLS_PER_DAY) {
      throw new AppError(400, 'No rerolls remaining today', 'NO_REROLLS');
    }

    await tx.playerQuest.delete({ where: { id: questId } });

    const created = await tx.playerQuest.create({
      data: {
        playerId,
        questKey: newDef.key,
        cadence: quest.cadence,
        targetValue,
        currentValue: 0,
        rewardAmount,
        status: 'active',
        filterValue,
        expiresAt: quest.expiresAt,
      },
    });

    await tx.playerQuestState.update({
      where: { playerId },
      data: { rerollsUsed: { increment: 1 } },
    });

    return created;
  });

  return toQuestData(newQuest);
}
