import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma as db } from '../__test__/setup';
import {
  getOrCreateQuestState,
  getActiveQuests,
  generateDailyQuests,
  generateWeeklyQuest,
  incrementQuestProgress,
  claimQuestReward,
  claimDailyBonus,
  getQuestState,
} from './questService';
import { QUEST_CONSTANTS } from '@pocketrealm/shared';

const PLAYER_ID = 'player-1';
// Wednesday 2026-02-25 at noon UTC
const NOW = new Date('2026-02-25T12:00:00Z');
// Monday 2026-02-23 at midnight UTC (start of this week)
const WEEK_START = new Date('2026-02-23T00:00:00Z');
// Today at midnight UTC
const DAY_START = new Date('2026-02-25T00:00:00Z');
// Tomorrow at midnight UTC
const TOMORROW = new Date('2026-02-26T00:00:00Z');
// Next Monday at midnight UTC
const NEXT_MONDAY = new Date('2026-03-02T00:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getOrCreateQuestState
// ---------------------------------------------------------------------------
describe('getOrCreateQuestState', () => {
  it('returns existing quest state via upsert', async () => {
    const existing = {
      id: 'qs-1',
      playerId: PLAYER_ID,
      questTokens: 42,
      dailyBonusClaimed: false,
      lastDailyReset: DAY_START,
      lastWeeklyReset: WEEK_START,
    };
    db.playerQuestState.upsert.mockResolvedValue(existing);

    const result = await getOrCreateQuestState(PLAYER_ID);
    expect(result).toEqual(existing);
    expect(db.playerQuestState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId: PLAYER_ID },
        create: expect.objectContaining({ playerId: PLAYER_ID }),
        update: {},
      }),
    );
  });

  it('creates new quest state for new player', async () => {
    const created = {
      id: 'qs-new',
      playerId: PLAYER_ID,
      questTokens: 0,
      dailyBonusClaimed: false,
      lastDailyReset: new Date('2000-01-01T00:00:00Z'),
      lastWeeklyReset: new Date('2000-01-01T00:00:00Z'),
    };
    db.playerQuestState.upsert.mockResolvedValue(created);

    const result = await getOrCreateQuestState(PLAYER_ID);
    expect(result.questTokens).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// incrementQuestProgress
// ---------------------------------------------------------------------------
describe('incrementQuestProgress', () => {
  it('increments matching active quest', async () => {
    db.playerQuest.findMany.mockResolvedValue([
      {
        id: 'q1',
        playerId: PLAYER_ID,
        questKey: 'kill_mobs',
        cadence: 'daily',
        targetValue: 15,
        currentValue: 5,
        rewardAmount: 5,
        status: 'active',
        filterValue: null,
        assignedAt: NOW,
        expiresAt: TOMORROW,
        completedAt: null,
        claimedAt: null,
      },
    ]);
    db.playerQuest.update.mockResolvedValue({
      id: 'q1',
      currentValue: 8,
      targetValue: 15,
      status: 'active',
    });

    const result = await incrementQuestProgress(PLAYER_ID, 'kill_count', 3);
    expect(result).toHaveLength(1);
    expect(result[0].questId).toBe('q1');
    expect(result[0].current).toBe(8);
    expect(result[0].target).toBe(15);
    expect(result[0].completed).toBe(false);
    expect(db.playerQuest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'q1' },
        data: expect.objectContaining({ currentValue: 8 }),
      }),
    );
  });

  it('marks quest completed when target reached', async () => {
    db.playerQuest.findMany.mockResolvedValue([
      {
        id: 'q1',
        playerId: PLAYER_ID,
        questKey: 'kill_mobs',
        cadence: 'daily',
        targetValue: 10,
        currentValue: 8,
        rewardAmount: 5,
        status: 'active',
        filterValue: null,
        assignedAt: NOW,
        expiresAt: TOMORROW,
        completedAt: null,
        claimedAt: null,
      },
    ]);
    db.playerQuest.update.mockResolvedValue({
      id: 'q1',
      currentValue: 10,
      targetValue: 10,
      status: 'completed',
    });

    const result = await incrementQuestProgress(PLAYER_ID, 'kill_count', 5);
    expect(result).toHaveLength(1);
    expect(result[0].completed).toBe(true);
    expect(result[0].current).toBe(10);
    expect(db.playerQuest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentValue: 10,
          status: 'completed',
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('returns empty array when no matching quests', async () => {
    db.playerQuest.findMany.mockResolvedValue([]);

    const result = await incrementQuestProgress(PLAYER_ID, 'kill_count', 3);
    expect(result).toHaveLength(0);
  });

  it('skips completed quests (only active quests returned by query)', async () => {
    // The query itself filters for status: 'active', so completed quests
    // won't be in the result set. Verifying empty result for no active match.
    db.playerQuest.findMany.mockResolvedValue([]);

    const result = await incrementQuestProgress(PLAYER_ID, 'kill_count', 3);
    expect(result).toHaveLength(0);
  });

  it('filters by prefix metadata for kill_prefix quests', async () => {
    db.playerQuest.findMany.mockResolvedValue([
      {
        id: 'q-prefix',
        playerId: PLAYER_ID,
        questKey: 'kill_prefix',
        cadence: 'daily',
        targetValue: 2,
        currentValue: 0,
        rewardAmount: 8,
        status: 'active',
        filterValue: 'ancient',
        assignedAt: NOW,
        expiresAt: TOMORROW,
        completedAt: null,
        claimedAt: null,
      },
    ]);
    db.playerQuest.update.mockResolvedValue({
      id: 'q-prefix',
      currentValue: 1,
      targetValue: 2,
      status: 'active',
    });

    // Matching prefix
    const result = await incrementQuestProgress(PLAYER_ID, 'kill_prefix', 1, {
      prefix: 'ancient',
    });
    expect(result).toHaveLength(1);
    expect(result[0].questId).toBe('q-prefix');
  });

  it('does not match prefix quest when prefix does not match', async () => {
    db.playerQuest.findMany.mockResolvedValue([
      {
        id: 'q-prefix',
        playerId: PLAYER_ID,
        questKey: 'kill_prefix',
        cadence: 'daily',
        targetValue: 2,
        currentValue: 0,
        rewardAmount: 8,
        status: 'active',
        filterValue: 'ancient',
        assignedAt: NOW,
        expiresAt: TOMORROW,
        completedAt: null,
        claimedAt: null,
      },
    ]);

    // Non-matching prefix
    const result = await incrementQuestProgress(PLAYER_ID, 'kill_prefix', 1, {
      prefix: 'cursed',
    });
    expect(result).toHaveLength(0);
    expect(db.playerQuest.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// claimQuestReward
// ---------------------------------------------------------------------------
describe('claimQuestReward', () => {
  it('awards tokens for completed quest', async () => {
    const quest = {
      id: 'q1',
      playerId: PLAYER_ID,
      questKey: 'kill_mobs',
      status: 'completed',
      rewardAmount: 5,
    };
    db.playerQuest.findFirst.mockResolvedValue(quest);
    db.playerQuest.update.mockResolvedValue({ ...quest, status: 'claimed', claimedAt: NOW });
    db.playerQuestState.update.mockResolvedValue({ questTokens: 47 });

    const result = await claimQuestReward(PLAYER_ID, 'q1');
    expect(result.tokensAwarded).toBe(5);
    expect(result.newBalance).toBe(47);
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('throws if quest not found', async () => {
    db.playerQuest.findFirst.mockResolvedValue(null);

    await expect(claimQuestReward(PLAYER_ID, 'nonexistent')).rejects.toThrow(
      /not found|not completed/i,
    );
  });

  it('throws if quest is still active (not completed)', async () => {
    db.playerQuest.findFirst.mockResolvedValue(null); // findFirst with status:'completed' returns null

    await expect(claimQuestReward(PLAYER_ID, 'q1')).rejects.toThrow(
      /not found|not completed/i,
    );
  });
});

// ---------------------------------------------------------------------------
// claimDailyBonus
// ---------------------------------------------------------------------------
describe('claimDailyBonus', () => {
  it('awards bonus when all daily quests are claimed', async () => {
    const state = {
      id: 'qs-1',
      playerId: PLAYER_ID,
      questTokens: 10,
      dailyBonusClaimed: false,
      lastDailyReset: DAY_START,
      lastWeeklyReset: WEEK_START,
    };
    db.playerQuestState.upsert.mockResolvedValue(state);
    // All 3 dailies are claimed
    db.playerQuest.count.mockResolvedValue(0); // 0 non-claimed dailies
    // Player level 10 → bonus = DAILY_BONUS_BASE + floor(10 * DAILY_BONUS_PER_LEVEL) = 5 + 5 = 10
    db.player.findUnique.mockResolvedValue({ characterLevel: 10 });
    db.playerQuestState.update.mockResolvedValue({
      ...state,
      questTokens: 20,
      dailyBonusClaimed: true,
    });

    const result = await claimDailyBonus(PLAYER_ID, NOW);
    expect(result.tokensAwarded).toBeGreaterThan(0);
    expect(result.newBalance).toBe(20);
    expect(db.playerQuestState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId: PLAYER_ID },
        data: expect.objectContaining({
          dailyBonusClaimed: true,
          questTokens: expect.objectContaining({ increment: expect.any(Number) }),
        }),
      }),
    );
  });

  it('throws if already claimed today', async () => {
    db.playerQuestState.upsert.mockResolvedValue({
      id: 'qs-1',
      playerId: PLAYER_ID,
      questTokens: 10,
      dailyBonusClaimed: true,
      lastDailyReset: DAY_START,
      lastWeeklyReset: WEEK_START,
    });

    await expect(claimDailyBonus(PLAYER_ID, NOW)).rejects.toThrow(/already claimed/i);
  });

  it('throws if not all daily quests are claimed', async () => {
    db.playerQuestState.upsert.mockResolvedValue({
      id: 'qs-1',
      playerId: PLAYER_ID,
      questTokens: 10,
      dailyBonusClaimed: false,
      lastDailyReset: DAY_START,
      lastWeeklyReset: WEEK_START,
    });
    // 1 non-claimed daily remains
    db.playerQuest.count.mockResolvedValue(1);

    await expect(claimDailyBonus(PLAYER_ID, NOW)).rejects.toThrow(
      /not all daily quests/i,
    );
  });
});

// ---------------------------------------------------------------------------
// generateDailyQuests
// ---------------------------------------------------------------------------
describe('generateDailyQuests', () => {
  it('creates DAILY_COUNT quests with diverse categories', async () => {
    let createCount = 0;
    db.playerQuest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      createCount++;
      return {
        id: `dq-${createCount}`,
        ...data,
        currentValue: 0,
        status: 'active',
        completedAt: null,
        claimedAt: null,
        assignedAt: NOW,
      };
    });

    const result = await generateDailyQuests(PLAYER_ID, 5, NOW);
    expect(result).toHaveLength(QUEST_CONSTANTS.DAILY_COUNT);

    // Verify at least MIN_DAILY_CATEGORIES distinct categories
    const categories = new Set(result.map((q) => q.category));
    expect(categories.size).toBeGreaterThanOrEqual(QUEST_CONSTANTS.MIN_DAILY_CATEGORIES);
  });

  it('uses correct level bracket targets', async () => {
    let createCount = 0;
    db.playerQuest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      createCount++;
      return {
        id: `dq-${createCount}`,
        ...data,
        currentValue: 0,
        status: 'active',
        completedAt: null,
        claimedAt: null,
        assignedAt: NOW,
      };
    });

    // Level 5 = low bracket
    const result = await generateDailyQuests(PLAYER_ID, 5, NOW);
    expect(result).toHaveLength(QUEST_CONSTANTS.DAILY_COUNT);
    // Each quest should have a targetValue > 0
    for (const q of result) {
      expect(q.targetValue).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// generateWeeklyQuest
// ---------------------------------------------------------------------------
describe('generateWeeklyQuest', () => {
  it('creates 1 weekly quest', async () => {
    db.playerQuest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
      id: 'wq-1',
      ...data,
      currentValue: 0,
      status: 'active',
      completedAt: null,
      claimedAt: null,
      assignedAt: NOW,
    }));

    const result = await generateWeeklyQuest(PLAYER_ID, 5, NOW);
    expect(result).toHaveLength(QUEST_CONSTANTS.WEEKLY_COUNT);
    expect(result[0].cadence).toBe('weekly');
  });
});

// ---------------------------------------------------------------------------
// getActiveQuests (lazy generation)
// ---------------------------------------------------------------------------
describe('getActiveQuests', () => {
  it('returns existing quests when no reset needed', async () => {
    // State shows resets happened today / this week
    db.playerQuestState.upsert.mockResolvedValue({
      id: 'qs-1',
      playerId: PLAYER_ID,
      questTokens: 0,
      dailyBonusClaimed: false,
      lastDailyReset: DAY_START,
      lastWeeklyReset: WEEK_START,
    });
    db.player.findUnique.mockResolvedValue({ characterLevel: 5 });

    const quests = [
      {
        id: 'q1',
        playerId: PLAYER_ID,
        questKey: 'kill_mobs',
        cadence: 'daily',
        targetValue: 5,
        currentValue: 2,
        rewardAmount: 4,
        status: 'active',
        filterValue: null,
        assignedAt: NOW,
        expiresAt: TOMORROW,
        completedAt: null,
        claimedAt: null,
      },
    ];
    db.playerQuest.findMany.mockResolvedValue(quests);

    const result = await getActiveQuests(PLAYER_ID, NOW);
    expect(result).toHaveLength(1);
    expect(result[0].questKey).toBe('kill_mobs');
  });

  it('triggers daily reset and generates new dailies when needed', async () => {
    // lastDailyReset is yesterday (needs reset)
    const yesterday = new Date('2026-02-24T00:00:00Z');
    db.playerQuestState.upsert.mockResolvedValue({
      id: 'qs-1',
      playerId: PLAYER_ID,
      questTokens: 0,
      dailyBonusClaimed: true,
      lastDailyReset: yesterday,
      lastWeeklyReset: WEEK_START,
    });
    db.player.findUnique.mockResolvedValue({ characterLevel: 5 });

    // Expire old dailies
    db.playerQuest.updateMany.mockResolvedValue({ count: 3 });
    // Update state
    db.playerQuestState.update.mockResolvedValue({
      lastDailyReset: DAY_START,
      dailyBonusClaimed: false,
    });

    // Generate new dailies
    let createCount = 0;
    db.playerQuest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      createCount++;
      return {
        id: `dq-${createCount}`,
        ...data,
        currentValue: 0,
        status: 'active',
        completedAt: null,
        claimedAt: null,
        assignedAt: NOW,
      };
    });

    // Return all quests at the end (the new ones + any weekly)
    db.playerQuest.findMany.mockResolvedValue([]);

    await getActiveQuests(PLAYER_ID, NOW);

    // Should have expired old dailies
    expect(db.playerQuest.updateMany).toHaveBeenCalled();
    // Should have updated the state
    expect(db.playerQuestState.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { playerId: PLAYER_ID },
        data: expect.objectContaining({
          lastDailyReset: DAY_START,
          dailyBonusClaimed: false,
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getQuestState
// ---------------------------------------------------------------------------
describe('getQuestState', () => {
  it('returns PlayerQuestStateData for the player', async () => {
    db.playerQuestState.upsert.mockResolvedValue({
      id: 'qs-1',
      playerId: PLAYER_ID,
      questTokens: 42,
      dailyBonusClaimed: false,
      lastDailyReset: DAY_START,
      lastWeeklyReset: WEEK_START,
    });

    const result = await getQuestState(PLAYER_ID);
    expect(result).toEqual({
      questTokens: 42,
      dailyBonusClaimed: false,
      lastDailyReset: DAY_START.toISOString(),
      lastWeeklyReset: WEEK_START.toISOString(),
    });
  });
});
