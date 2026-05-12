import { ALWAYS_AVAILABLE_ACTION_IDS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({
    previousTurns: 100_000, spent: 50_000, currentTurns: 50_000, lastRegenAt: new Date().toISOString(), timeToCapMs: 1000, }), }));

import { mockPrisma } from '../__test__/setup';
import { SKILL_POINT_CONSTANTS, CHARACTER_CONSTANTS } from '@pocketrealm/shared';
import { spendPlayerTurnsTx } from './turnBankService';
import {
  getSkillPoints,
  allocatePoints,
  respecPoints,
  getUnlockedActions,
} from './skillPointService';

const PLAYER_ID = 'player-1';

beforeEach(() => {
  vi.clearAllMocks();
});

// --- helpers ---

function mockSkillLevels(levels: number[]) {
  mockPrisma.playerSkill.findMany.mockResolvedValue(
    levels.map((level) => ({ level })),
  );
}

function mockAllocation(allocations: Record<string, number> | null) {
  if (allocations === null) {
    // No record exists; trigger create path
    mockPrisma.skillPointAllocation.findUnique.mockResolvedValue(null);
    mockPrisma.skillPointAllocation.create.mockResolvedValue({ allocations: {} });
  } else {
    mockPrisma.skillPointAllocation.findUnique.mockResolvedValue({ allocations });
  }
}

// =============================================================================
// getSkillPoints
// =============================================================================

describe('getSkillPoints', () => {
  it('returns correct state with no allocations', async () => {
    mockSkillLevels([1, 1, 1]);
    mockAllocation({});

    const result = await getSkillPoints(PLAYER_ID);

    expect(result.playerId).toBe(PLAYER_ID);
    // All skills at level 1 → 0 leveling points + STARTING_SKILL_POINTS bonus
    expect(result.totalPointsEarned).toBe(CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.totalPointsSpent).toBe(0);
    expect(result.availablePoints).toBe(CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.allocations).toEqual({});
    expect(result.unlockedActions).toEqual([]);
  });

  it('returns correct state with existing allocations', async () => {
    // 3 skills: levels 10, 5, 1 → (9+4+0)*1 = 13 leveling points + starting bonus
    mockSkillLevels([10, 5, 1]);
    // melee_power_strike costs 5, unlocksAction 'power_strike'
    mockAllocation({ melee_power_strike: 5 });

    const result = await getSkillPoints(PLAYER_ID);

    expect(result.totalPointsEarned).toBe(13 + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.totalPointsSpent).toBe(5);
    expect(result.availablePoints).toBe(8 + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
    expect(result.allocations).toEqual({ melee_power_strike: 5 });
    expect(result.unlockedActions).toEqual(['power_strike']);
  });

  it('calculates total points from sum of skill levels', async () => {
    // levels 5, 3, 1 → (4+2+0)*1 = 6 leveling points + starting bonus
    mockSkillLevels([5, 3, 1]);
    mockAllocation({});

    const result = await getSkillPoints(PLAYER_ID);

    expect(result.totalPointsEarned).toBe(6 + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
  });

  it('creates allocation record if none exists', async () => {
    mockSkillLevels([1]);
    mockAllocation(null);

    const result = await getSkillPoints(PLAYER_ID);

    expect(mockPrisma.skillPointAllocation.create).toHaveBeenCalledWith({
      data: { playerId: PLAYER_ID, allocations: {} },
    });
    expect(result.allocations).toEqual({});
  });
});

// =============================================================================
// allocatePoints
// =============================================================================

describe('allocatePoints', () => {
  it('successfully allocates to a tier-1 node', async () => {
    // Player has 10 points available
    mockSkillLevels([11]); // (11-1)*1 = 10 points
    // First getSkillPoints call (validation): empty allocations
    mockPrisma.skillPointAllocation.findUnique
      .mockResolvedValueOnce({ allocations: {} })
      // Second getSkillPoints call (return value): now has the node
      .mockResolvedValueOnce({ allocations: { melee_power_strike: 5 } });
    mockPrisma.skillPointAllocation.update.mockResolvedValue({});

    const result = await allocatePoints(PLAYER_ID, 'melee_power_strike');

    expect(mockPrisma.skillPointAllocation.update).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { allocations: { melee_power_strike: 5 } },
    });
    expect(result.totalPointsSpent).toBe(5);
    // (11-1)*1 leveling + STARTING_SKILL_POINTS = 15 earned; 15 - 5 spent = 10 available
    expect(result.availablePoints).toBe(10 + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS - 5);
    expect(result.unlockedActions).toEqual(['power_strike']);
  });

  it('rejects duplicate allocation', async () => {
    mockSkillLevels([11]);
    mockAllocation({ melee_power_strike: 5 });

    await expect(allocatePoints(PLAYER_ID, 'melee_power_strike')).rejects.toThrow(
      "Node 'melee_power_strike' is already unlocked",
    );
  });

  it('rejects insufficient points', async () => {
    // All skills at level 1 → 0 leveling points + STARTING_SKILL_POINTS (5).
    // Already spent 4 points → only 1 available, not enough for melee_power_strike (cost 5).
    mockSkillLevels([1]);
    mockAllocation({ some_cheap_node: 4 });

    await expect(allocatePoints(PLAYER_ID, 'melee_power_strike')).rejects.toThrow(
      'Not enough skill points (need 5, have 1)',
    );
  });

  it('rejects unmet prerequisites', async () => {
    // melee_cleave requires melee_power_strike
    mockSkillLevels([20]); // 19 points (enough)
    mockAllocation({}); // no prereq unlocked
    // Provide the skill gate so it won't fail there first
    mockPrisma.playerSkill.findFirst.mockResolvedValue({ level: 15 });

    await expect(allocatePoints(PLAYER_ID, 'melee_cleave')).rejects.toThrow(
      "Prerequisite 'melee_power_strike' not unlocked",
    );
  });

  it('rejects unmet skill level gate', async () => {
    // melee_cleave requires melee level 15
    mockSkillLevels([20]); // 19 points (enough)
    mockAllocation({ melee_power_strike: 5 }); // prereq met
    // Skill gate check: melee level is only 10
    mockPrisma.playerSkill.findFirst.mockResolvedValue({ level: 10 });

    await expect(allocatePoints(PLAYER_ID, 'melee_cleave')).rejects.toThrow(
      'Requires melee level 15 (current: 10)',
    );
  });

  it('rejects unknown node ID', async () => {
    await expect(allocatePoints(PLAYER_ID, 'nonexistent_node')).rejects.toThrow(
      "Talent node 'nonexistent_node' not found",
    );
  });
});

// =============================================================================
// respecPoints
// =============================================================================

describe('respecPoints', () => {
  it('resets all allocations and spends turns', async () => {
    const now = new Date('2026-01-01T00:00:00Z');

    // First getSkillPoints (validation): has allocations
    mockPrisma.playerSkill.findMany
      .mockResolvedValueOnce([{ level: 11 }]) // 10 points earned
      .mockResolvedValueOnce([{ level: 11 }]); // second getSkillPoints call
    mockPrisma.skillPointAllocation.findUnique
      .mockResolvedValueOnce({ allocations: { melee_power_strike: 5 } })
      // After respec, return empty allocations
      .mockResolvedValueOnce({ allocations: {} });
    mockPrisma.skillPointAllocation.update.mockResolvedValue({});

    const result = await respecPoints(PLAYER_ID, now);

    expect(spendPlayerTurnsTx).toHaveBeenCalledWith(
      expect.anything(),
      PLAYER_ID,
      SKILL_POINT_CONSTANTS.RESPEC_TURN_COST,
      now,
    );
    expect(mockPrisma.skillPointAllocation.update).toHaveBeenCalledWith({
      where: { playerId: PLAYER_ID },
      data: { allocations: {} },
    });
    expect(result.totalPointsSpent).toBe(0);
    // (11-1)*1 leveling points + STARTING_SKILL_POINTS = 15 available after respec
    expect(result.availablePoints).toBe(10 + CHARACTER_CONSTANTS.STARTING_SKILL_POINTS);
  });

  it('rejects when nothing to respec', async () => {
    mockSkillLevels([1]);
    mockAllocation({});

    await expect(respecPoints(PLAYER_ID)).rejects.toThrow('No points to respec');
  });
});

// =============================================================================
// getUnlockedActions
// =============================================================================

describe('getUnlockedActions', () => {
  it('returns base actions plus talent-unlocked actions', async () => {
    mockSkillLevels([11]);
    mockAllocation({ melee_power_strike: 5, magic_fire_bolt: 5 });

    const result = await getUnlockedActions(PLAYER_ID);

    const baseIds = [...ALWAYS_AVAILABLE_ACTION_IDS];
    // Should include all base actions
    for (const key of baseIds) {
      expect(result).toContain(key);
    }
    // Should include talent unlocks
    expect(result).toContain('power_strike');
    expect(result).toContain('fire_bolt');
    // Total = base count + 2 talent unlocks
    expect(result).toHaveLength(baseIds.length + 2);
  });

  it('returns only base actions when no talent allocations', async () => {
    mockSkillLevels([1]);
    mockAllocation({});

    const result = await getUnlockedActions(PLAYER_ID);

    expect(result).toEqual([...ALWAYS_AVAILABLE_ACTION_IDS]);
  });
});
