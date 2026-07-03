import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@pocketrealm/database';
import { mockPrisma } from '../../__test__/setup';
import { craftItem } from './craftRouteService';

vi.mock('../../services/activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));
vi.mock('../../services/chatActivityService', () => ({
  broadcastCraftActivity: vi.fn(),
}));
vi.mock('../../services/equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({ luck: 0 }),
}));
vi.mock('../../services/guildService', () => ({
  addGuildXp: vi.fn(),
  getPlayerGuildId: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../services/guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn().mockResolvedValue({ craftingCrit: 0 }),
}));
vi.mock('../../services/buffService', () => ({
  getBuffValue: vi.fn().mockResolvedValue(0),
  consumeBuffStandalone: vi.fn(),
}));
vi.mock('../../services/premiumEntitlement', () => ({
  getHasActivePremiumEntitlement: vi.fn().mockResolvedValue(false),
}));
vi.mock('../../services/expeditionLockoutService', () => ({
  checkActivityLockout: vi.fn(),
}));
vi.mock('../../services/xpService', () => ({
  grantSkillXp: vi.fn().mockResolvedValue({
    skillType: 'tailoring',
    xpAfterEfficiency: 10,
    efficiency: 1,
    leveledUp: false,
    newLevel: 10,
    atDailyCap: false,
    newTotalXp: 100,
    newDailyXpGained: 10,
    characterXpGain: 3,
    characterXpAfter: 3,
    characterLevelBefore: 1,
    characterLevelAfter: 1,
    attributePointsAfter: 0,
    characterLeveledUp: false,
  }),
}));
vi.mock('../../services/progressService', () => ({
  trackProgress: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/guildTaxService', () => ({
  spendWithTaxTx: vi.fn().mockResolvedValue({
    turnSpend: { spent: 20, taxed: 0, baseCost: 20, remaining: 4980 },
    taxResult: null,
  }),
  taxInfoFromResult: vi.fn().mockReturnValue(null),
}));
vi.mock('../../services/stateUpdateHelpers', () => ({
  fetchItemDTOs: vi.fn().mockImplementation(async (ids: string[]) => ids.map((id) => ({ id }))),
  fetchSkillDTOs: vi.fn().mockResolvedValue([]),
  fetchCharacterProgression: vi.fn().mockResolvedValue({}),
  fetchInventoryMeta: vi.fn().mockResolvedValue({ inventoryUsedSlots: 1 }),
  fetchMaterialTotals: vi.fn().mockResolvedValue({ mat: 8 }),
  buildInventoryStateUpdates: vi.fn().mockImplementation((updates: {
    removed?: unknown[];
    added?: unknown[];
    updated?: unknown[];
    inventoryUsedSlots: number;
    materialTotals?: Record<string, number>;
  }) => ({
    ...(updates.removed && updates.removed.length > 0 ? { inventoryRemoved: updates.removed } : {}),
    ...(updates.added && updates.added.length > 0 ? { inventoryAdded: updates.added } : {}),
    ...(updates.updated && updates.updated.length > 0 ? { inventoryUpdated: updates.updated } : {}),
    inventoryUsedSlots: updates.inventoryUsedSlots,
    ...(updates.materialTotals ? { materialTotals: updates.materialTotals } : {}),
  })),
}));
vi.mock('../../utils/routeHelpers.js', () => ({
  serializeXpGrant: vi.fn((grant) => grant),
  assertNotRecovering: vi.fn(),
  assertCanAct: vi.fn(),
  trackAchievements: vi.fn(),
}));

function baseInput(body: Record<string, unknown>) {
  return {
    player: { playerId: 'player-1', username: 'Tester' },
    body,
  } as Parameters<typeof craftItem>[0];
}

function mockRecipe(stackable = false) {
  mockPrisma.craftingRecipe.findUnique.mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    skillType: 'tailoring',
    requiredLevel: 1,
    isAdvanced: false,
    materials: [{ templateId: '22222222-2222-4222-8222-222222222222', quantity: 2 }],
    resultTemplateId: '33333333-3333-4333-8333-333333333333',
    turnCost: 20,
    xpReward: 10,
    resultTemplate: {
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Silk Robe',
      itemType: 'armor',
      slot: 'chest',
      stackable,
      maxDurability: 100,
      baseStats: { armor: 5 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRecipe(false);
  mockPrisma.player.findUnique.mockResolvedValue({ currentZoneId: 'zone-1' });
  mockPrisma.zone.findUnique.mockResolvedValue({
    name: 'Millbrook',
    maxCraftingLevel: null,
  });
  mockPrisma.playerSkill.findUnique.mockResolvedValue({ level: 10 });
  mockPrisma.item.findMany.mockImplementation(async (args?: { select?: Record<string, unknown> }) => {
    if (args?.select && 'template' in args.select) {
      return [];
    }
    return [{ id: 'mat-1', quantity: 10 }];
  });
  mockPrisma.item.findFirst.mockResolvedValue(null);
  mockPrisma.itemTemplate.findUnique.mockResolvedValue({ stackable: true });
  mockPrisma.item.create.mockResolvedValue({ id: 'crafted-1' });
  mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
  mockPrisma.turnBank.findUnique.mockResolvedValue({
    playerId: 'player-1',
    currentTurns: 5000,
    regenProgress: 0,
    lastRegenAt: new Date('2026-07-02T12:00:00.000Z'),
  });
  mockPrisma.guildMember.findUnique.mockResolvedValue(null);
  mockPrisma.turnBank.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.fetchItemDTOs?.mockReset?.();
});

describe('craftItem stash destination', () => {
  it('creates non-stackable crafted items in stash and does not append them to backpack state', async () => {
    const res = await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      destination: 'stash',
    }));

    expect(mockPrisma.item.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ inStash: true }),
    }));
    expect(res.body.stateUpdates.inventoryAdded).toBeUndefined();
    expect(res.body.stateUpdates.materialTotals).toBeDefined();
  });

  it('allows stash destination while over-encumbered by skipping assertCanAct', async () => {
    const routeHelpers = await import('../../utils/routeHelpers.js');

    await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      destination: 'stash',
    }));

    expect(routeHelpers.assertNotRecovering).toHaveBeenCalledWith('player-1');
    expect(routeHelpers.assertCanAct).not.toHaveBeenCalled();
  });

  it('keeps current inventory destination guard behavior', async () => {
    const routeHelpers = await import('../../utils/routeHelpers.js');

    await craftItem(baseInput({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      destination: 'inventory',
    }));

    expect(routeHelpers.assertCanAct).toHaveBeenCalledWith('player-1');
  });
});
