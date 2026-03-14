import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({
    previousTurns: 1000, spent: 100, currentTurns: 900,
    lastRegenAt: new Date().toISOString(), timeToCapMs: 1000,
  }),
}));

import { mockPrisma } from '../__test__/setup';
import { repairAllEquipped } from './repairService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEquipped(items: Array<{
  slot: string;
  id: string;
  rarity?: string;
  currentDurability: number | null;
  maxDurability: number | null;
  template: { name: string; itemType: string; maxDurability: number; tier?: number };
}>) {
  return items.map((i) => ({
    slot: i.slot,
    item: {
      id: i.id,
      ownerId: 'p1',
      rarity: i.rarity ?? 'common',
      currentDurability: i.currentDurability,
      maxDurability: i.maxDurability,
      template: { ...i.template, tier: i.template.tier ?? 1 },
    },
  }));
}

describe('repairAllEquipped', () => {
  it('returns repaired:false when no items are damaged', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 100,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );

    const result = await repairAllEquipped(mockPrisma as any, 'p1');

    expect(result.repaired).toBe(false);
    expect(result.totalTurnCost).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('repairs a single damaged item with correct turn cost', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);

    // Tier 1 common, not broken → 50
    expect(result.repaired).toBe(true);
    expect(result.totalTurnCost).toBe(50);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].turnCost).toBe(50);
    expect(result.items[0].slot).toBe('main_hand');
    expect(result.items[0].name).toBe('Sword');
  });

  it('uses broken repair cost for items with 0 durability', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'chest',
          id: 'item-2',
          currentDurability: 0,
          maxDurability: 80,
          template: { name: 'Plate Armor', itemType: 'armor', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);

    // Tier 1 common, broken → ceil(50 * 1.5) = 75
    expect(result.totalTurnCost).toBe(75);
    expect(result.items[0].turnCost).toBe(75);
  });

  it('sums costs for multiple damaged items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          slot: 'chest',
          id: 'item-2',
          currentDurability: 0,
          maxDurability: 80,
          template: { name: 'Plate Armor', itemType: 'armor', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);

    // Tier 1 not broken (50) + Tier 1 broken (75) = 125
    const expectedCost = 125;
    expect(result.totalTurnCost).toBe(expectedCost);
    expect(result.items).toHaveLength(2);
  });

  it('skips non-weapon/armor equipped items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'charm',
          id: 'item-1',
          currentDurability: 10,
          maxDurability: 50,
          template: { name: 'Amulet', itemType: 'accessory', maxDurability: 50 },
        },
      ]),
    );

    const result = await repairAllEquipped(mockPrisma as any, 'p1');

    expect(result.repaired).toBe(false);
    expect(result.items).toEqual([]);
  });

  it('destroys item when maxDurability reaches 0', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 0,
          maxDurability: 1,
          template: { name: 'Old Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.playerEquipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.delete.mockResolvedValue({});

    // decay of 1 (minimum) → maxDurability 1 - 1 = 0 → destroyed
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.1);

    expect(result.items[0].destroyed).toBe(true);
    expect(result.items[0].maxDurability).toBe(0);
    expect(result.items[0].currentDurability).toBe(0);
    expect(mockPrisma.item.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('throws on optimistic lock failure', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repairAllEquipped(mockPrisma as any, 'p1', () => 0.5),
    ).rejects.toThrow('Item durability changed');
  });

  it('scales repair cost by item tier', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'T3 Sword', itemType: 'weapon', maxDurability: 100, tier: 3 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);

    // Tier 3, not broken → 100 turns
    expect(result.items[0].turnCost).toBe(100);
    expect(result.totalTurnCost).toBe(100);
  });

  it('applies broken multiplier to tier-scaled cost', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 0,
          maxDurability: 100,
          template: { name: 'T5 Sword', itemType: 'weapon', maxDurability: 100, tier: 5 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.5);

    // Tier 5 broken → ceil(150 * 1.5) = 225 turns
    expect(result.items[0].turnCost).toBe(225);
  });

  it('scales max-durability decay by rarity (legendary = 1)', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          rarity: 'legendary',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Legendary Blade', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    // Any random value — legendary always decays by exactly 1
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.99);

    expect(result.items[0].maxDurabilityDecay).toBe(1);
    expect(result.items[0].maxDurability).toBe(99);
  });

  it('uses higher decay for common rarity', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          rarity: 'common',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Common Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    // randomFn returns 0.99 → floor(0.99 * 6) = 5, clamped to maxDecay 5
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.99);

    expect(result.items[0].maxDurabilityDecay).toBe(5);
    expect(result.items[0].maxDurability).toBe(95);
  });

  it('includes destroyed items in result with turn cost charged', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-ok',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Good Sword', itemType: 'weapon', maxDurability: 100 },
        },
        {
          slot: 'off_hand',
          id: 'item-doomed',
          currentDurability: 0,
          maxDurability: 1,
          template: { name: 'Dying Shield', itemType: 'armor', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.playerEquipment.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.delete.mockResolvedValue({});

    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.1);

    expect(result.items).toHaveLength(2);
    const ok = result.items.find(i => i.name === 'Good Sword')!;
    const doomed = result.items.find(i => i.name === 'Dying Shield')!;
    expect(ok.destroyed).toBe(false);
    expect(doomed.destroyed).toBe(true);
    // Total cost includes both items
    expect(result.totalTurnCost).toBe(ok.turnCost + doomed.turnCost);
  });
});
