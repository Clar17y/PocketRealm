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
    const counts: Record<string, number> = { common: 0, uncommon: 0, rare: 0, epic: 0 };
    for (let i = 0; i < 5000; i++) {
      counts[rollRarityWithLuck(1000)]++;
    }
    expect(counts.common).toBeGreaterThan(0);
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
    zoneId: 'zone-1',
    mobFamilyId: 'family-1',
    luck: 0,
  };

  beforeEach(() => {
    mockTxAny.resourceNode = { findMany: vi.fn() };
    mockTxAny.itemTemplate = { findFirst: vi.fn() };
    mockTxAny.craftingRecipe = { findFirst: vi.fn(), findMany: vi.fn() };
    (mockTx.item.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  it('grants 2-4 cut gem drops when zone has resource nodes with refining recipes', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
    ]);
    mockTxAny.itemTemplate.findFirst.mockResolvedValue({ id: 'raw-sapphire-id' });
    mockTxAny.craftingRecipe.findFirst.mockResolvedValue({
      resultTemplateId: 'cut-sapphire-id',
      resultTemplate: { name: 'Cut Sapphire' },
    });
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.materials.length).toBeGreaterThan(0);
    expect(result.materials[0]!.itemTemplateId).toBe('cut-sapphire-id');
    expect(result.materials[0]!.name).toBe('Cut Sapphire');
    expect(addStackableItemTx).toHaveBeenCalled();
    const totalQuantity = result.materials.reduce((sum, m) => sum + m.quantity, 0);
    expect(totalQuantity).toBeGreaterThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MIN);
    expect(totalQuantity).toBeLessThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MAX);
  });

  it('returns empty materials when zone has no resource nodes', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockTxAny.resourceNode.findMany.mockResolvedValue([]);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.materials).toEqual([]);
    expect(result.soulboundItem).toBeNull();
    expect(addStackableItemTx).not.toHaveBeenCalled();
  });

  it('returns empty materials when no raw gem template exists', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
    ]);
    mockTxAny.itemTemplate.findFirst.mockResolvedValue(null);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.materials).toEqual([]);
    expect(addStackableItemTx).not.toHaveBeenCalled();
  });

  it('returns empty materials when no refining recipe exists for the raw gem', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
    ]);
    mockTxAny.itemTemplate.findFirst.mockResolvedValue({ id: 'raw-sapphire-id' });
    mockTxAny.craftingRecipe.findFirst.mockResolvedValue(null);
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.materials).toEqual([]);
    expect(addStackableItemTx).not.toHaveBeenCalled();
  });

  it('aggregates quantities when the same gem is picked multiple times', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
    ]);
    mockTxAny.itemTemplate.findFirst.mockResolvedValue({ id: 'raw-sapphire-id' });
    mockTxAny.craftingRecipe.findFirst.mockResolvedValue({
      resultTemplateId: 'cut-sapphire-id',
      resultTemplate: { name: 'Cut Sapphire' },
    });
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    // With only one gem type, all rolls should aggregate into one entry
    expect(result.materials.length).toBe(1);
    expect(result.materials[0]!.itemTemplateId).toBe('cut-sapphire-id');
    const totalQuantity = result.materials[0]!.quantity;
    expect(totalQuantity).toBeGreaterThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MIN);
    expect(totalQuantity).toBeLessThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MAX);
  });

  it('grants soulbound item when Math.random < SOULBOUND_DROP_CHANCE', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
    ]);
    mockTxAny.itemTemplate.findFirst.mockResolvedValue({ id: 'raw-sapphire-id' });
    mockTxAny.craftingRecipe.findFirst.mockResolvedValue({
      resultTemplateId: 'cut-sapphire-id',
      resultTemplate: { name: 'Cut Sapphire' },
    });
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
    expect(mockTx.item.create).toHaveBeenCalled();
  });

  it('does not grant soulbound item when Math.random >= SOULBOUND_DROP_CHANCE', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
    ]);
    mockTxAny.itemTemplate.findFirst.mockResolvedValue({ id: 'raw-sapphire-id' });
    mockTxAny.craftingRecipe.findFirst.mockResolvedValue({
      resultTemplateId: 'cut-sapphire-id',
      resultTemplate: { name: 'Cut Sapphire' },
    });
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
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
    ]);
    mockTxAny.itemTemplate.findFirst.mockResolvedValue({ id: 'raw-sapphire-id' });
    mockTxAny.craftingRecipe.findFirst.mockResolvedValue({
      resultTemplateId: 'cut-sapphire-id',
      resultTemplate: { name: 'Cut Sapphire' },
    });
    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.soulboundItem).toBeNull();
  });

  it('handles multiple resource nodes producing different cut gems', async () => {
    // Use alternating random values: first call = 0.5 (material rolls), then alternating for picks
    let callCount = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
      callCount++;
      // Return 0.99 so soulbound check fails
      if (callCount > 10) return 0.99;
      return 0.5;
    });

    mockTxAny.resourceNode.findMany.mockResolvedValue([
      { skillRequired: 'mining', levelRequired: 5 },
      { skillRequired: 'foraging', levelRequired: 1 },
    ]);

    // First call: raw sapphire for mining tier 2, second call: raw amber for foraging tier 1
    mockTxAny.itemTemplate.findFirst
      .mockResolvedValueOnce({ id: 'raw-sapphire-id' })
      .mockResolvedValueOnce({ id: 'raw-amber-id' });

    mockTxAny.craftingRecipe.findFirst
      .mockResolvedValueOnce({
        resultTemplateId: 'cut-sapphire-id',
        resultTemplate: { name: 'Cut Sapphire' },
      })
      .mockResolvedValueOnce({
        resultTemplateId: 'polished-amber-id',
        resultTemplate: { name: 'Polished Amber' },
      });

    mockTxAny.craftingRecipe.findMany.mockResolvedValue([]);

    const result = await grantCacheLootTx(mockTx, params);

    expect(result.materials.length).toBeGreaterThan(0);
    expect(addStackableItemTx).toHaveBeenCalled();
    const totalQuantity = result.materials.reduce((sum, m) => sum + m.quantity, 0);
    expect(totalQuantity).toBeGreaterThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MIN);
    expect(totalQuantity).toBeLessThanOrEqual(HIDDEN_CACHE_CONSTANTS.MATERIAL_ROLLS_MAX);
  });
});
