import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@adventure/database';
import { HIDDEN_CACHE_CONSTANTS } from '@adventure/shared';

vi.mock('./inventoryService', () => ({
  addStackableItemTx: vi.fn().mockResolvedValue(undefined),
}));

import { rollRarityWithLuck, grantCacheLootTx } from './cacheLootService';
import { addStackableItemTx } from './inventoryService';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// rollRarityWithLuck
// ---------------------------------------------------------------------------
describe('rollRarityWithLuck', () => {
  it('produces all 4 rarities at luck=0 over many rolls', () => {
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 1000; i++) {
      counts[rollRarityWithLuck(0)]++;
    }
    expect(counts.common).toBeGreaterThan(0);
    expect(counts.uncommon).toBeGreaterThan(0);
    expect(counts.rare).toBeGreaterThan(0);
    expect(counts.epic).toBeGreaterThan(0);
  });

  it('shifts toward higher rarities at luck=100', () => {
    const lowLuckCounts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0 };
    const highLuckCounts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0 };

    for (let i = 0; i < 5000; i++) {
      lowLuckCounts[rollRarityWithLuck(0)]++;
      highLuckCounts[rollRarityWithLuck(100)]++;
    }

    // At high luck, epic should be more common and common should be less common
    const lowEpicRate = lowLuckCounts.epic / 5000;
    const highEpicRate = highLuckCounts.epic / 5000;
    expect(highEpicRate).toBeGreaterThan(lowEpicRate);

    const lowCommonRate = lowLuckCounts.common / 5000;
    const highCommonRate = highLuckCounts.common / 5000;
    expect(highCommonRate).toBeLessThan(lowCommonRate);
  });

  it('clamps common weight at minimum 5 even at very high luck', () => {
    // At luck=1000, the common weight formula: max(5, 50 - 1000*0.005*100) = max(5, -450) = 5
    // Common should still appear occasionally because its weight is clamped to 5
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 5000; i++) {
      counts[rollRarityWithLuck(1000)]++;
    }
    // Common should still appear (weight=5 out of total)
    expect(counts.common).toBeGreaterThan(0);
    // But very rare compared to others
    expect(counts.common).toBeLessThan(counts.uncommon + counts.rare + counts.epic);
  });
});

// ---------------------------------------------------------------------------
// grantCacheLootTx
// ---------------------------------------------------------------------------
describe('grantCacheLootTx', () => {
  const mockTx = {
    item: { create: vi.fn().mockResolvedValue({}) },
  } as unknown as Prisma.TransactionClient;
  const mockTxAny = mockTx as unknown as Record<string, any>;

  const params = {
    playerId: 'player-1',
    mobFamilyId: 'family-1',
    luck: 0,
  };

  beforeEach(() => {
    mockTxAny.chestDropTable = { findMany: vi.fn() };
    mockTxAny.craftingRecipe = { findMany: vi.fn() };
    (mockTx.item.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('grants 2-4 material drops when drop table has entries', async () => {
    // Fix random so materialRolls = randomIntInclusive(2,4) and pickWeighted always picks
    // We need Math.random calls: randomIntInclusive for materialRolls, then pickWeighted for each roll,
    // then randomIntInclusive for quantity per roll, then the soulbound check.
    // Use a real random but just ensure the drop table has entries.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    mockTxAny.chestDropTable.findMany.mockResolvedValue([
      {
        itemTemplateId: 'ore-1',
        dropChance: 10,
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0, name: 'Iron Ore' },
      },
    ]);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    // Should have material loot
    expect(result.materials.length).toBeGreaterThan(0);
    expect(result.materials[0]!.itemTemplateId).toBe('ore-1');
    // addStackableItemTx should have been called
    expect(addStackableItemTx).toHaveBeenCalled();
    // quantity should be between MATERIAL_ROLLS_MIN(2) and MATERIAL_ROLLS_MAX(4)
    const totalQuantity = result.materials.reduce((sum, m) => sum + m.quantity, 0);
    expect(totalQuantity).toBeGreaterThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MIN);
    expect(totalQuantity).toBeLessThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MAX);
  });

  it('returns empty materials when drop table has no entries', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockTxAny.chestDropTable.findMany.mockResolvedValue([]);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.materials).toEqual([]);
    expect(result.soulboundItem).toBeNull();
    expect(addStackableItemTx).not.toHaveBeenCalled();
  });

  it('grants soulbound item when Math.random < SOULBOUND_DROP_CHANCE', async () => {
    // First random calls: materialRolls, then per-roll picks, then soulbound check
    // We need the soulbound check (Math.random()) to be < 0.15
    // Strategy: mock random to return 0.01 for everything
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    mockTxAny.chestDropTable.findMany.mockResolvedValue([
      {
        itemTemplateId: 'ore-1',
        dropChance: 10,
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0, name: 'Iron Ore' },
      },
    ]);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([
      {
        resultTemplateId: 'sword-soul-1',
        resultTemplate: { name: 'Soulbound Sword', itemType: 'weapon', stackable: false, maxDurability: 100 },
      },
    ]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.soulboundItem).not.toBeNull();
    expect(result.soulboundItem!.itemTemplateId).toBe('sword-soul-1');
    expect(result.soulboundItem!.name).toBe('Soulbound Sword');
    // item.create should have been called for the soulbound item
    expect(mockTx.item.create).toHaveBeenCalled();
  });

  it('does not grant soulbound item when Math.random >= SOULBOUND_DROP_CHANCE', async () => {
    // Return 0.99 so soulbound check fails (0.99 >= 0.15)
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    mockTxAny.chestDropTable.findMany.mockResolvedValue([
      {
        itemTemplateId: 'ore-1',
        dropChance: 10,
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0, name: 'Iron Ore' },
      },
    ]);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([
      {
        resultTemplateId: 'sword-soul-1',
        resultTemplate: { name: 'Soulbound Sword', itemType: 'weapon', stackable: false, maxDurability: 100 },
      },
    ]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.soulboundItem).toBeNull();
  });

  it('does not grant soulbound item when no soulbound recipes exist', async () => {
    // random < 0.15 so soulbound roll passes, but no recipes available
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    mockTxAny.chestDropTable.findMany.mockResolvedValue([
      {
        itemTemplateId: 'ore-1',
        dropChance: 10,
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplate: { itemType: 'material', stackable: true, maxDurability: 0, name: 'Iron Ore' },
      },
    ]);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.soulboundItem).toBeNull();
  });

  it('creates non-stackable items via tx.item.create', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    mockTxAny.chestDropTable.findMany.mockResolvedValue([
      {
        itemTemplateId: 'helm-1',
        dropChance: 10,
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplate: { itemType: 'armor', stackable: false, maxDurability: 50, name: 'Iron Helm' },
      },
    ]);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    // Non-stackable armor items should use tx.item.create, not addStackableItemTx
    expect(mockTx.item.create).toHaveBeenCalled();
    expect(addStackableItemTx).not.toHaveBeenCalled();
    expect(result.materials.length).toBeGreaterThan(0);
    expect(result.materials[0]!.itemTemplateId).toBe('helm-1');
  });
});
