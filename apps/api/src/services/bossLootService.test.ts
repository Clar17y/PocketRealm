import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));
vi.mock('../utils/random', () => ({
  randomIntInclusive: vi.fn().mockReturnValue(0),
}));
vi.mock('./lootService', () => ({
  rollAndGrantLoot: vi.fn().mockResolvedValue([]),
  enrichLootWithNames: vi.fn().mockResolvedValue([]),
}));
vi.mock('./inventoryService', () => ({
  addStackableItem: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./xpService', () => ({
  grantSkillXp: vi.fn().mockResolvedValue({
    xpResult: { xpAfterEfficiency: 100, leveledUp: false },
    newLevel: 5,
  }),
}));
vi.mock('./achievementService', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
  emitAchievementNotifications: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@adventure/database';
import { WORLD_EVENT_CONSTANTS } from '@adventure/shared';
import { distributeBossLoot } from './bossLootService';
import { rollAndGrantLoot, enrichLootWithNames } from './lootService';
import { grantSkillXp } from './xpService';
import { checkAchievements, emitAchievementNotifications } from './achievementService';

const mockPrisma = prisma as unknown as Record<string, any>;

function setupMobLookup(name = 'Dragon', familyId = 'fam-1') {
  mockPrisma.mobTemplate.findUnique.mockResolvedValue({
    name,
    familyMembers: [{ mobFamily: { id: familyId } }],
  });
  mockPrisma.itemTemplate.findMany.mockResolvedValue([]);
  // rollBossRecipeDrop accesses craftingRecipe via prisma-as-any
  mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);
}

describe('distributeBossLoot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMobLookup();
  });

  it('returns empty object when contributors array is empty', async () => {
    const result = await distributeBossLoot('mob-1', 10, [], 1);
    expect(result).toEqual({});
    expect(rollAndGrantLoot).not.toHaveBeenCalled();
  });

  it('calls rollAndGrantLoot for each contributor with correct drop multiplier', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0 },
      { playerId: 'p2', totalDamage: 100, totalHealing: 0 },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 1);

    expect(rollAndGrantLoot).toHaveBeenCalledTimes(2);
    // Equal contribution → ratio = 0.5, dropMultiplier = 0.5 * 2 = 1.0
    const rarityBonus = WORLD_EVENT_CONSTANTS.BOSS_RARITY_BONUS;
    expect(rollAndGrantLoot).toHaveBeenCalledWith('p1', 'mob-1', 10 + rarityBonus, 1.0);
    expect(rollAndGrantLoot).toHaveBeenCalledWith('p2', 'mob-1', 10 + rarityBonus, 1.0);
  });

  it('calls grantSkillXp for each contributor with scaled XP', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 200, totalHealing: 0 },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 1);

    const baseXp = WORLD_EVENT_CONSTANTS.BOSS_BASE_XP_REWARD_BY_TIER[0]!;
    // Solo contributor → ratio = 1, scaledXp = baseXp * max(0.5, min(2, 1*1)) = baseXp
    expect(grantSkillXp).toHaveBeenCalledWith('p1', 'magic', baseXp);
  });

  it('uses contributor attackSkill as skill type', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0, attackSkill: 'melee' },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 1);

    expect(grantSkillXp).toHaveBeenCalledWith('p1', 'melee', expect.any(Number));
  });

  it('defaults attackSkill to magic when not provided', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0 },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 1);

    expect(grantSkillXp).toHaveBeenCalledWith('p1', 'magic', expect.any(Number));
  });

  it('looks up mob template and family for recipe drops', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0 },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 1);

    expect(mockPrisma.mobTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: 'mob-1' },
      select: {
        name: true,
        familyMembers: { select: { mobFamily: { select: { id: true } } } },
      },
    });
  });

  it('handles multiple contributors with correct contribution ratios', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 300, totalHealing: 0 },
      { playerId: 'p2', totalDamage: 100, totalHealing: 0 },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 2);

    const baseXp = WORLD_EVENT_CONSTANTS.BOSS_BASE_XP_REWARD_BY_TIER[1]!;
    const rarityBonus = WORLD_EVENT_CONSTANTS.BOSS_RARITY_BONUS;

    // p1: ratio = 300/400 = 0.75, multiplier = max(0.5, min(2, 0.75*2)) = 1.5
    expect(rollAndGrantLoot).toHaveBeenCalledWith('p1', 'mob-1', 10 + rarityBonus, 1.5);
    expect(grantSkillXp).toHaveBeenCalledWith('p1', 'magic', Math.round(baseXp * 1.5));

    // p2: ratio = 100/400 = 0.25, multiplier = max(0.5, min(2, 0.25*2)) = 0.5
    expect(rollAndGrantLoot).toHaveBeenCalledWith('p2', 'mob-1', 10 + rarityBonus, 0.5);
    expect(grantSkillXp).toHaveBeenCalledWith('p2', 'magic', Math.round(baseXp * 0.5));
  });

  it('includes XP reward in result for each contributor', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0 },
    ];

    const result = await distributeBossLoot('mob-1', 10, contributors, 1);

    expect(result['p1']).toBeDefined();
    expect(result['p1']!.xp).toEqual({
      skillType: 'magic',
      rawXp: expect.any(Number),
      xpAfterEfficiency: 100,
      leveledUp: false,
      newLevel: 5,
    });
  });

  it('calls checkAchievements and emitAchievementNotifications per contributor', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0 },
      { playerId: 'p2', totalDamage: 100, totalHealing: 0 },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 1);

    expect(checkAchievements).toHaveBeenCalledTimes(2);
    expect(emitAchievementNotifications).toHaveBeenCalledTimes(2);
    expect(checkAchievements).toHaveBeenCalledWith('p1', {
      statKeys: ['totalBossKills', 'totalBossDamage'],
      familyId: 'fam-1',
    });
  });

  it('clamps zoneTier to valid index range', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0 },
    ];

    // zoneTier 0 → tierIndex clamped to 0
    await distributeBossLoot('mob-1', 10, contributors, 0);
    const baseXp = WORLD_EVENT_CONSTANTS.BOSS_BASE_XP_REWARD_BY_TIER[0]!;
    expect(grantSkillXp).toHaveBeenCalledWith('p1', 'magic', baseXp);
  });

  it('handles trophy drops when mob name matches BOSS_TROPHY_DROPS', async () => {
    setupMobLookup('Alpha Wolf', 'fam-wolf');
    mockPrisma.itemTemplate.findMany.mockResolvedValue([
      { id: 'trophy-tmpl-1', name: 'Alpha Wolf Fang' },
    ]);

    const { addStackableItem } = await import('./inventoryService.js');
    const contributors = [
      { playerId: 'p1', totalDamage: 100, totalHealing: 0 },
    ];

    const result = await distributeBossLoot('mob-1', 10, contributors, 1);

    expect(addStackableItem).toHaveBeenCalledWith('p1', 'trophy-tmpl-1', expect.any(Number));
    expect(result['p1']!.loot).toContainEqual(
      expect.objectContaining({
        itemTemplateId: 'trophy-tmpl-1',
        itemName: 'Alpha Wolf Fang',
        rarity: 'common',
      }),
    );
  });

  it('includes healing in contribution calculation', async () => {
    const contributors = [
      { playerId: 'p1', totalDamage: 0, totalHealing: 200 },
      { playerId: 'p2', totalDamage: 200, totalHealing: 0 },
    ];

    await distributeBossLoot('mob-1', 10, contributors, 1);

    const rarityBonus = WORLD_EVENT_CONSTANTS.BOSS_RARITY_BONUS;
    // Equal total contribution (200 each) → ratio = 0.5, multiplier = 1.0
    expect(rollAndGrantLoot).toHaveBeenCalledWith('p1', 'mob-1', 10 + rarityBonus, 1.0);
    expect(rollAndGrantLoot).toHaveBeenCalledWith('p2', 'mob-1', 10 + rarityBonus, 1.0);
  });
});
