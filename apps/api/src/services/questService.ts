import { prisma } from '@adventure/database';
import {
  QUEST_TEMPLATE_DEFINITIONS,
  QUEST_CONSTANTS,
  getAllMobPrefixes,
  type ProgressType,
  type QuestTemplateDefinition,
  type PlayerQuestData,
  type PlayerQuestStateData,
  type QuestProgressUpdate,
} from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Start of the current UTC day (midnight). */
function getDayStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Start of the current UTC week (Monday midnight). */
function getWeekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/** Next UTC midnight after `now`. */
function getNextDayStart(now: Date): Date {
  const d = getDayStart(now);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Next Monday UTC midnight after `now`. */
function getNextWeekStart(now: Date): Date {
  const ws = getWeekStart(now);
  ws.setUTCDate(ws.getUTCDate() + 7);
  return ws;
}

function getLevelBracket(level: number): 'low' | 'mid' | 'high' {
  if (level <= 10) return 'low';
  if (level <= 25) return 'mid';
  return 'high';
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Shuffle array in place (Fisher-Yates). */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
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
    name: def?.name ?? row.questKey,
    description: def?.description ?? '',
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

  // Daily reset check
  const needsDailyReset = state.lastDailyReset < todayStart;
  if (needsDailyReset) {
    // Expire old active dailies
    await prisma.playerQuest.updateMany({
      where: { playerId, cadence: 'daily', status: 'active' },
      data: { status: 'expired' },
    });

    // Generate new daily quests
    await generateDailyQuests(playerId, playerLevel, now);

    // Update state
    await prisma.playerQuestState.update({
      where: { playerId },
      data: { lastDailyReset: todayStart, dailyBonusClaimed: false },
    });
  }

  // Weekly reset check
  const needsWeeklyReset = state.lastWeeklyReset < weekStart;
  if (needsWeeklyReset) {
    // Expire old active weeklies
    await prisma.playerQuest.updateMany({
      where: { playerId, cadence: 'weekly', status: 'active' },
      data: { status: 'expired' },
    });

    // Generate new weekly quest
    await generateWeeklyQuest(playerId, playerLevel, now);

    // Update state
    await prisma.playerQuestState.update({
      where: { playerId },
      data: { lastWeeklyReset: weekStart },
    });
  }

  // Return active + completed + claimed quests (not expired)
  const quests = await prisma.playerQuest.findMany({
    where: {
      playerId,
      status: { in: ['active', 'completed', 'claimed'] },
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

  // Filter to daily templates (skip unlock condition filtering for now)
  const dailyDefs = QUEST_TEMPLATE_DEFINITIONS.filter((d) => d.cadence === 'daily');
  const shuffled = shuffle([...dailyDefs]);

  // Pick ensuring at least MIN_DAILY_CATEGORIES distinct categories
  const selected: QuestTemplateDefinition[] = [];
  const usedCategories = new Set<string>();

  // First pass: pick from different categories
  for (const def of shuffled) {
    if (selected.length >= DAILY_COUNT) break;
    if (!usedCategories.has(def.category) && usedCategories.size < MIN_DAILY_CATEGORIES) {
      selected.push(def);
      usedCategories.add(def.category);
    }
  }

  // Second pass: fill remaining slots
  for (const def of shuffled) {
    if (selected.length >= DAILY_COUNT) break;
    if (!selected.includes(def)) {
      selected.push(def);
      usedCategories.add(def.category);
    }
  }

  // Ensure category spread: if only 1 category, swap last pick
  if (usedCategories.size < MIN_DAILY_CATEGORIES && selected.length >= MIN_DAILY_CATEGORIES) {
    const differentCatDef = shuffled.find(
      (d) => !usedCategories.has(d.category) && !selected.includes(d),
    );
    if (differentCatDef) {
      selected[selected.length - 1] = differentCatDef;
    }
  }

  // Create quest rows
  const created: PlayerQuestData[] = [];
  for (const def of selected) {
    const targetValue = def.targets[bracket];
    const [rewardMin, rewardMax] = def.rewards[bracket];
    const rewardAmount = randomInt(rewardMin, rewardMax);

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
  const expiresAt = getNextWeekStart(now);

  // Filter to weekly templates
  const weeklyDefs = QUEST_TEMPLATE_DEFINITIONS.filter((d) => d.cadence === 'weekly');
  const def = weeklyDefs[Math.floor(Math.random() * weeklyDefs.length)]!;

  const targetValue = def.targets[bracket];
  const [rewardMin, rewardMax] = def.rewards[bracket];
  const rewardAmount = randomInt(rewardMin, rewardMax);

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

    const newValue = Math.min(quest.currentValue + amount, quest.targetValue);
    const completed = newValue >= quest.targetValue;

    const updated = await prisma.playerQuest.update({
      where: { id: quest.id },
      data: {
        currentValue: newValue,
        ...(completed ? { status: 'completed', completedAt: new Date() } : {}),
      },
    });

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
): Promise<{ tokensAwarded: number }> {
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
    await tx.playerQuestState.update({
      where: { playerId },
      data: { questTokens: { increment: quest.rewardAmount } },
    });

    return { tokensAwarded: quest.rewardAmount };
  });
}

// ---------------------------------------------------------------------------
// claimDailyBonus
// ---------------------------------------------------------------------------

export async function claimDailyBonus(
  playerId: string,
  now: Date = new Date(),
): Promise<{ bonusTokens: number }> {
  const state = await getOrCreateQuestState(playerId);

  if (state.dailyBonusClaimed) {
    throw new AppError(400, 'Daily bonus already claimed', 'ALREADY_CLAIMED');
  }

  // Check that all daily quests for today are claimed
  const todayStart = getDayStart(now);
  const unclaimedDailies = await prisma.playerQuest.count({
    where: {
      playerId,
      cadence: 'daily',
      assignedAt: { gte: todayStart },
      status: { not: 'claimed' },
    },
  });

  if (unclaimedDailies > 0) {
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

  // Award bonus
  await prisma.playerQuestState.update({
    where: { playerId },
    data: {
      dailyBonusClaimed: true,
      questTokens: { increment: bonusTokens },
    },
  });

  return { bonusTokens };
}

// ---------------------------------------------------------------------------
// getQuestState
// ---------------------------------------------------------------------------

export async function getQuestState(playerId: string): Promise<PlayerQuestStateData> {
  const state = await getOrCreateQuestState(playerId);
  return {
    questTokens: state.questTokens,
    dailyBonusClaimed: state.dailyBonusClaimed,
    lastDailyReset: state.lastDailyReset.toISOString(),
    lastWeeklyReset: state.lastWeeklyReset.toISOString(),
  };
}
