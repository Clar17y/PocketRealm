import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DURABILITY_CONSTANTS } from '@pocketrealm/shared';

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
  currentDurability: number | null;
  maxDurability: number | null;
  template: { name: string; itemType: string; maxDurability: number };
}>) {
  return items.map((i) => ({
    slot: i.slot,
    item: {
      id: i.id,
      ownerId: 'p1',
      currentDurability: i.currentDurability,
      maxDurability: i.maxDurability,
      template: i.template,
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

    expect(result.repaired).toBe(true);
    expect(result.totalTurnCost).toBe(DURABILITY_CONSTANTS.REPAIR_TURN_COST);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].turnCost).toBe(DURABILITY_CONSTANTS.REPAIR_TURN_COST);
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

    expect(result.totalTurnCost).toBe(DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST);
    expect(result.items[0].turnCost).toBe(DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST);
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

    const expectedCost = DURABILITY_CONSTANTS.REPAIR_TURN_COST + DURABILITY_CONSTANTS.BROKEN_REPAIR_TURN_COST;
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

  it('enforces minimum max durability', async () => {
    const minMax = DURABILITY_CONSTANTS.MIN_MAX_DURABILITY;
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          slot: 'main_hand',
          id: 'item-1',
          currentDurability: 5,
          maxDurability: minMax + 1,
          template: { name: 'Old Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ]),
    );
    mockPrisma.item.updateMany.mockResolvedValue({ count: 1 });

    // randomFn returns 0.99 to maximize decay
    const result = await repairAllEquipped(mockPrisma as any, 'p1', () => 0.99);

    expect(result.items[0].maxDurability).toBeGreaterThanOrEqual(minMax);
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
});
