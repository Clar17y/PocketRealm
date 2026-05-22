import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../../__test__/setup';
import { craftItem } from './craftRouteService';
import { craftSchema, getSkillLevel, getZoneCraftingLevel } from './helpers';
import { getTotalQuantityByTemplate, getInventoryState, consumeItemsByTemplateTx } from '../inventoryService';
import { spendWithTaxTx } from '../guildTaxService';
import { grantSkillXp } from '../xpService';
import { grantPassiveVocationXpTx, getVocationSnapshot } from '../vocationService';
import { trackAchievements } from '../../utils/routeHelpers.js';

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock('../activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));

vi.mock('../chatActivityService', () => ({
  broadcastCraftActivity: vi.fn(),
}));

vi.mock('../equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({ luck: 0 }),
}));

vi.mock('../inventoryService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../inventoryService')>();
  return {
    ...actual,
    getTotalQuantityByTemplate: vi.fn(),
    getInventoryState: vi.fn(),
    consumeItemsByTemplateTx: vi.fn(),
  };
});

vi.mock('../stateUpdateHelpers', () => ({
  fetchItemDTOs: vi.fn().mockResolvedValue([]),
  fetchSkillDTOs: vi.fn().mockResolvedValue([]),
  fetchCharacterProgression: vi.fn().mockResolvedValue({ characterXp: 0, characterLevel: 1, attributePoints: 0 }),
  fetchInventoryMeta: vi.fn().mockResolvedValue({ inventoryUsedSlots: 1 }),
  fetchMaterialTotals: vi.fn().mockResolvedValue({}),
  buildInventoryStateUpdates: vi.fn().mockReturnValue({
    inventoryAdded: [],
    inventoryUpdated: [],
    inventoryRemoved: [],
    inventoryUsedSlots: 1,
    materialTotals: {},
  }),
}));

vi.mock('../xpService', () => ({
  grantSkillXp: vi.fn(),
}));

vi.mock('../guildService', () => ({
  addGuildXp: vi.fn(),
  getPlayerGuildId: vi.fn().mockResolvedValue(null),
}));

vi.mock('../guildTaxService', () => ({
  spendWithTaxTx: vi.fn(),
  taxInfoFromResult: vi.fn().mockReturnValue(null),
}));

vi.mock('../guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn().mockResolvedValue({ craftingCrit: 0 }),
}));

vi.mock('../buffService', () => ({
  getBuffValue: vi.fn().mockResolvedValue(0),
  consumeBuffStandalone: vi.fn(),
}));

vi.mock('../premiumEntitlement', () => ({
  getHasActivePremiumEntitlement: vi.fn().mockResolvedValue(false),
}));

vi.mock('../progressService', () => ({
  trackProgress: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../utils/routeHelpers.js', () => ({
  serializeXpGrant: vi.fn((grant) => grant),
  assertCanAct: vi.fn().mockResolvedValue(undefined),
  trackAchievements: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../expeditionLockoutService', () => ({
  checkActivityLockout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@pocketrealm/game-engine', () => ({
  calculateCraftingCrit: vi.fn().mockReturnValue({ rarity: 'common', isCrit: false }),
  rollBonusStatsForRarity: vi.fn().mockReturnValue(null),
}));

vi.mock('../vocationService', () => ({
  grantPassiveVocationXpTx: vi.fn(),
  getVocationSnapshot: vi.fn(),
}));

vi.mock('./helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./helpers')>();
  return {
    ...actual,
    getSkillLevel: vi.fn(),
    getZoneCraftingLevel: vi.fn(),
  };
});

const PLAYER_ID = '11111111-1111-4111-8111-111111111111';
const RECIPE_ID = '22222222-2222-4222-8222-222222222222';
const TEMPLATE_ID = '33333333-3333-4333-8333-333333333333';
const MATERIAL_ID = '44444444-4444-4444-8444-444444444444';

function mockModel() {
  return {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
  };
}

function recipe(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RECIPE_ID,
    vocationId: 'weaponsmith',
    skillType: 'weaponsmithing',
    requiredLevel: 1,
    isAdvanced: false,
    resultTemplateId: TEMPLATE_ID,
    turnCost: 5,
    xpReward: 20,
    materials: [{ templateId: MATERIAL_ID, quantity: 2 }],
    resultTemplate: {
      id: TEMPLATE_ID,
      name: 'Iron Sword',
      itemType: 'weapon',
      slot: 'main_hand',
      stackable: false,
      maxDurability: 100,
      baseStats: { attack: 5 },
    },
    ...overrides,
  };
}

async function act(body: Record<string, unknown>) {
  return craftItem({
    body,
    player: { playerId: PLAYER_ID, username: 'Tester', accountId: 'account-1', seasonId: null, role: 'player' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.playerVocationTechnique = mockModel();
  mockPrisma.playerVocationCounter = mockModel();

  vi.mocked(getZoneCraftingLevel).mockResolvedValue({ zoneId: 'zone-1', zoneName: 'Town', maxCraftingLevel: null });
  vi.mocked(getSkillLevel).mockResolvedValue(10);
  mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe());
  vi.mocked(getTotalQuantityByTemplate).mockResolvedValue(99);
  vi.mocked(getInventoryState).mockResolvedValue({ usedSlots: 0, capacity: 24, availableSlots: 24 });
  vi.mocked(spendWithTaxTx).mockResolvedValue({
    turnSpend: { previousTurns: 100, spent: 5, currentTurns: 95, lastRegenAt: '2026-05-21T00:00:00.000Z', timeToCapMs: null },
    taxResult: { preTaxAmount: 5, taxAmount: 0, postTaxAmount: 5, taxRatePercent: 0, guildId: null },
  });
  vi.mocked(consumeItemsByTemplateTx).mockResolvedValue({ fullyConsumedIds: [], partiallyConsumedIds: [] });
  mockPrisma.item.findFirst.mockResolvedValue(null);
  mockPrisma.item.findMany.mockResolvedValue([]);
  mockPrisma.item.create.mockResolvedValue({ id: 'crafted-1' });
  mockPrisma.item.update.mockResolvedValue({ id: 'stack-1' });
  vi.mocked(grantSkillXp).mockResolvedValue({
    skillType: 'weaponsmithing',
    xpResult: { xpGained: 20, xpAfterEfficiency: 20, efficiency: 1, leveledUp: false, newLevel: 1, atDailyCap: false },
    boostedXpAfterEfficiency: 20,
    newTotalXp: 20,
    newDailyXpGained: 20,
    newLevel: 1,
    skillLeveledUp: false,
    characterXpGain: 2,
    characterXpAfter: 2,
    characterLevelBefore: 1,
    characterLevelAfter: 1,
    attributePointsAfter: 0,
    characterLeveledUp: false,
    skillPointsGained: 0,
  });
  vi.mocked(grantPassiveVocationXpTx).mockResolvedValue({
    vocationId: 'weaponsmith',
    xp: 10,
    rank: 1,
    xpForCurrentRank: 0,
    xpForNextRank: 300,
    masteryPointsEarned: 0,
    availableMasteryPoints: 0,
    spentPoints: 0,
    learnedTechniqueIds: [],
  });
  vi.mocked(getVocationSnapshot).mockResolvedValue({
    playerId: PLAYER_ID,
    vocations: [],
    dailyCap: {
      dayStart: '2026-05-21T00:00:00.000Z',
      turnsSpent: 0,
      turnsLimit: 50,
      turnsRemaining: 50,
    },
  });
});

describe('craftItem vocation integration', () => {
  it('accepts an optional non-empty techniqueId and rejects an empty techniqueId', () => {
    expect(craftSchema.parse({ recipeId: RECIPE_ID, quantity: 1 })).toEqual({
      recipeId: RECIPE_ID,
      quantity: 1,
    });
    expect(craftSchema.parse({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'weaponsmith_blood_groove' }))
      .toMatchObject({ techniqueId: 'weaponsmith_blood_groove' });
    expect(() => craftSchema.parse({ recipeId: RECIPE_ID, quantity: 1, techniqueId: '' })).toThrow();
    expect(() => craftSchema.parse({ recipeId: RECIPE_ID, quantity: 1, techniqueId: '   ' })).toThrow();
  });

  it('grants passive vocation XP without a technique and leaves craftMarks unset', async () => {
    const result = await act({ recipeId: RECIPE_ID, quantity: 1 });

    expect(grantPassiveVocationXpTx).toHaveBeenCalledWith({
      tx: mockPrisma,
      playerId: PLAYER_ID,
      vocationId: 'weaponsmith',
      source: 'craft',
      baseXp: 20,
    });
    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ craftMarks: expect.anything() }),
    }));
    expect(result.body).toMatchObject({
      stateUpdates: {
        vocations: { playerId: PLAYER_ID },
      },
    });
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_crafts_weaponsmith' } },
      create: { playerId: PLAYER_ID, statKey: 'vocation_crafts_weaponsmith', value: 1 },
      update: { value: { increment: 1 } },
    });
    expect(trackAchievements).toHaveBeenCalledWith(
      PLAYER_ID,
      expect.objectContaining({ totalTurnsSpent: 5 }),
      {
        statKeys: expect.arrayContaining([
          'totalVocationCrafts',
          'vocationCrafts_weaponsmith',
          'highestVocationRank',
          'vocationRank5Count',
          'vocationRank10Count',
        ]),
      },
    );
  });

  it('crafts normally without vocation XP or technique effects when no vocation resolves', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({
      vocationId: 'unknown_vocation',
    }));

    const result = await act({ recipeId: RECIPE_ID, quantity: 1 });

    expect(result.body).toMatchObject({
      crafted: { quantity: 1 },
      stateUpdates: expect.not.objectContaining({ vocations: expect.anything() }),
    });
    expect(grantPassiveVocationXpTx).not.toHaveBeenCalled();
    expect(getVocationSnapshot).not.toHaveBeenCalled();
    expect(mockPrisma.playerVocationTechnique.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.playerVocationCounter.upsert).not.toHaveBeenCalled();
  });

  it('rejects a selected technique when no vocation resolves', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({
      vocationId: 'unknown_vocation',
    }));

    await expect(act({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'weaponsmith_blood_groove' }))
      .rejects.toMatchObject({ code: 'VOCATION_NOT_AVAILABLE' });
  });

  it('applies a selected learned craft mark to a created non-stackable item', async () => {
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'weaponsmith_blood_groove' },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'weaponsmith_blood_groove' });

    const createData = mockPrisma.item.create.mock.calls[0][0].data;
    expect(createData.craftMarks).toEqual([
      expect.objectContaining({
        markId: 'weaponsmith_blood_groove_blood_groove_mark',
        name: 'Blood Groove Mark',
        sourceTechniqueId: 'weaponsmith_blood_groove',
        itemStatBenefits: [{ stat: 'attack', value: 0.05, isPercent: true }],
        itemStatDrawbacks: [{ stat: 'critDamage', value: -0.02, isPercent: true }],
        actionModifiers: expect.any(Array),
      }),
    ]);
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_crafts_weaponsmith' } },
      create: { playerId: PLAYER_ID, statKey: 'vocation_crafts_weaponsmith', value: 1 },
      update: { value: { increment: 1 } },
    });
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_technique_uses_weaponsmith_blood_groove' } },
      create: { playerId: PLAYER_ID, statKey: 'vocation_technique_uses_weaponsmith_blood_groove', value: 1 },
      update: { value: { increment: 1 } },
    });
    expect(mockPrisma.playerVocationCounter.upsert).toHaveBeenCalledWith({
      where: { playerId_statKey: { playerId: PLAYER_ID, statKey: 'vocation_mark_crafted_weaponsmith_blood_groove_blood_groove_mark' } },
      create: { playerId: PLAYER_ID, statKey: 'vocation_mark_crafted_weaponsmith_blood_groove_blood_groove_mark', value: 1 },
      update: { value: { increment: 1 } },
    });
    expect(trackAchievements).toHaveBeenCalledWith(
      PLAYER_ID,
      expect.objectContaining({ totalTurnsSpent: 5 }),
      {
        statKeys: expect.arrayContaining([
          'totalVocationTechniqueUses',
          'distinctVocationTechniquesUsed',
          'totalVocationCraftMarks',
          'distinctVocationCraftMarks',
        ]),
      },
    );
  });

  it('rejects an unlearned or ineligible technique', async () => {
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([]);

    await expect(act({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'weaponsmith_blood_groove' }))
      .rejects.toMatchObject({ code: 'TECHNIQUE_NOT_ELIGIBLE' });
  });

  it.each([
    {
      name: 'wrong vocation',
      techniqueId: 'bowyer_even_limb',
      recipeOverride: {},
    },
    {
      name: 'wrong slot',
      techniqueId: 'weaponsmith_blood_groove',
      recipeOverride: {
        resultTemplate: {
          id: TEMPLATE_ID,
          name: 'Offhand Sword',
          itemType: 'weapon',
          slot: 'off_hand',
          stackable: false,
          maxDurability: 100,
          baseStats: { attack: 5 },
        },
      },
    },
    {
      name: 'wrong type',
      techniqueId: 'weaponsmith_blood_groove',
      recipeOverride: {
        resultTemplate: {
          id: TEMPLATE_ID,
          name: 'Sword-Shaped Armor',
          itemType: 'armor',
          slot: 'main_hand',
          stackable: false,
          maxDurability: 100,
          baseStats: { armor: 5 },
        },
      },
    },
  ])('rejects a selected technique for $name', async ({ techniqueId, recipeOverride }) => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe(recipeOverride));
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([{ techniqueId }]);

    await expect(act({ recipeId: RECIPE_ID, quantity: 1, techniqueId }))
      .rejects.toMatchObject({ code: 'TECHNIQUE_NOT_ELIGIBLE' });
  });

  it('applies material and turn multipliers before validation and spending', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({ turnCost: 25 }));
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'weaponsmith_anvil_rebound' },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'weaponsmith_anvil_rebound' });

    expect(getTotalQuantityByTemplate).toHaveBeenCalledWith(PLAYER_ID, MATERIAL_ID);
    expect(spendWithTaxTx).toHaveBeenCalledWith(mockPrisma, PLAYER_ID, 24);
    expect(consumeItemsByTemplateTx).toHaveBeenCalledWith(mockPrisma, PLAYER_ID, MATERIAL_ID, 3);
  });

  it('applies output quantity delta to stackable outputs', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({
      skillType: 'alchemy',
      vocationId: 'alchemist',
      turnCost: 1,
      resultTemplate: {
        id: TEMPLATE_ID,
        name: 'Potion',
        itemType: 'consumable',
        slot: null,
        stackable: true,
        maxDurability: 0,
        baseStats: {},
      },
    }));
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'alchemist_scaled_retort' },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 5, techniqueId: 'alchemist_scaled_retort' });

    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 6 }),
    }));
  });

  it('ignores output quantity delta for non-stackable outputs', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({ turnCost: 1 }));
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'weaponsmith_quench_batch' },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 5, techniqueId: 'weaponsmith_quench_batch' });

    expect(mockPrisma.item.create).toHaveBeenCalledTimes(5);
    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ quantity: 1 }),
    }));
  });

  it('does not merge a marked stackable output into an unmarked stack', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({
      skillType: 'alchemy',
      vocationId: 'alchemist',
      resultTemplate: {
        id: TEMPLATE_ID,
        name: 'Potion',
        itemType: 'consumable',
        slot: null,
        stackable: true,
        maxDurability: 0,
        baseStats: {},
      },
    }));
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'alchemist_strong_extract' },
    ]);
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'unmarked-stack', quantity: 7, craftMarks: null },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'alchemist_strong_extract' });

    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        templateId: TEMPLATE_ID,
        quantity: 1,
        craftMarks: expect.arrayContaining([
          expect.objectContaining({ sourceTechniqueId: 'alchemist_strong_extract' }),
        ]),
      }),
    }));
  });

  it('does not merge a marked stackable output into a differently marked stack', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({
      skillType: 'alchemy',
      vocationId: 'alchemist',
      resultTemplate: {
        id: TEMPLATE_ID,
        name: 'Potion',
        itemType: 'consumable',
        slot: null,
        stackable: true,
        maxDurability: 0,
        baseStats: {},
      },
    }));
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'alchemist_strong_extract' },
    ]);
    mockPrisma.item.findMany.mockResolvedValue([
      {
        id: 'differently-marked-stack',
        quantity: 7,
        craftMarks: [{
          markId: 'other_mark',
          name: 'Other Mark',
          sourceTechniqueId: 'other_technique',
          description: 'Other',
          itemStatBenefits: [],
          itemStatDrawbacks: [],
          actionModifiers: [],
        }],
      },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'alchemist_strong_extract' });

    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        templateId: TEMPLATE_ID,
        quantity: 1,
        craftMarks: expect.arrayContaining([
          expect.objectContaining({ sourceTechniqueId: 'alchemist_strong_extract' }),
        ]),
      }),
    }));
  });

  it('merges a marked stackable output when persisted craftMarks have different object key order', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({
      skillType: 'alchemy',
      vocationId: 'alchemist',
      resultTemplate: {
        id: TEMPLATE_ID,
        name: 'Potion',
        itemType: 'consumable',
        slot: null,
        stackable: true,
        maxDurability: 0,
        baseStats: {},
      },
    }));
    mockPrisma.playerVocationTechnique.findMany.mockResolvedValue([
      { techniqueId: 'alchemist_strong_extract' },
    ]);
    mockPrisma.item.findMany.mockResolvedValue([
      {
        id: 'same-mark-stack',
        quantity: 7,
        rarity: 'common',
        bonusStats: null,
        craftMarks: [{
          actionModifiers: [],
          itemStatDrawbacks: [{ value: -0.02, stat: 'dodge', isPercent: true }],
          itemStatBenefits: [{ value: 0.03, stat: 'luck', isPercent: true }],
          description: 'A visible maker mark that improves one item property by accepting a linked drawback.',
          sourceTechniqueId: 'alchemist_strong_extract',
          name: 'Tempered Signature',
          markId: 'alchemist_strong_extract_tempered_signature',
        }],
      },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 1, techniqueId: 'alchemist_strong_extract' });

    expect(mockPrisma.item.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'same-mark-stack' },
      data: { quantity: 8 },
    }));
    expect(mockPrisma.item.create).not.toHaveBeenCalled();
  });

  it('does not merge a stackable output into stacks with different rarity or bonusStats', async () => {
    mockPrisma.craftingRecipe.findUnique.mockResolvedValue(recipe({
      skillType: 'alchemy',
      vocationId: 'alchemist',
      resultTemplate: {
        id: TEMPLATE_ID,
        name: 'Potion',
        itemType: 'consumable',
        slot: null,
        stackable: true,
        maxDurability: 0,
        baseStats: {},
      },
    }));
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'rare-stack', quantity: 7, rarity: 'rare', bonusStats: null, craftMarks: null },
      { id: 'bonus-stack', quantity: 3, rarity: 'common', bonusStats: { luck: 1 }, craftMarks: null },
    ]);

    await act({ recipeId: RECIPE_ID, quantity: 1 });

    expect(mockPrisma.item.update).not.toHaveBeenCalled();
    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        templateId: TEMPLATE_ID,
        rarity: 'common',
        quantity: 1,
      }),
    }));
  });
});
