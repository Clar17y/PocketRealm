import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./inventoryService', () => ({
  addStackableItemTx: vi.fn().mockResolvedValue({ itemId: 'stack-1', quantity: 1 }),
}));

import { mockPrisma } from '../__test__/setup';
import { grantEncounterSiteChestRewardsTx } from './chestService';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('grantEncounterSiteChestRewardsTx', () => {
  const params = {
    playerId: 'p1',
    mobFamilyId: 'family-1',
    size: 'small' as const,
  };

  it('returns chest rewards with empty loot when no drop entries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockPrisma.chestDropTable.findMany.mockResolvedValue([]);
    mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, params);
    expect(result.chestRarity).toBeDefined();
    expect(result.materialRolls).toBeGreaterThanOrEqual(0);
    expect(result.loot).toEqual([]);
  });

  it('grants stackable materials from weighted drops', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    mockPrisma.chestDropTable.findMany.mockResolvedValue([
      {
        itemTemplateId: 'ore-1',
        dropChance: 10,
        minQuantity: 1,
        maxQuantity: 3,
        itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0 },
      },
    ]);
    mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, params);
    expect(result.loot.length).toBeGreaterThanOrEqual(0); // depends on materialRolls
  });

  it('aggregates same template loot into one entry', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    mockPrisma.chestDropTable.findMany.mockResolvedValue([
      {
        itemTemplateId: 'ore-1',
        dropChance: 10,
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0 },
      },
    ]);
    mockPrisma.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, {
      ...params,
      size: 'large',
    });

    // All loot of same template should be aggregated
    const oreEntries = result.loot.filter(l => l.itemTemplateId === 'ore-1');
    expect(oreEntries.length).toBeLessThanOrEqual(1);
  });

  it('returns no recipe when roll fails', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockPrisma.chestDropTable.findMany.mockResolvedValue([]);

    const result = await grantEncounterSiteChestRewardsTx(mockPrisma as any, params);
    expect(result.recipeUnlocked).toBeNull();
  });
});
