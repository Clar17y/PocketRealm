import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DURABILITY_CONSTANTS } from '@adventure/shared';

import { mockPrisma } from '../__test__/setup';
import { degradeEquippedDurability } from './durabilityService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeEquipped(items: Array<{
  id: string;
  currentDurability: number | null;
  maxDurability: number | null;
  template: { name: string; itemType: string; maxDurability: number };
}>) {
  return items.map((item) => ({
    item: {
      id: item.id,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
      template: item.template,
    },
  }));
}

describe('degradeEquippedDurability', () => {
  it('returns empty array for invalid amount', async () => {
    const result = await degradeEquippedDurability('p1', 0);
    expect(result).toEqual([]);
  });

  it('returns empty array for negative amount', async () => {
    const result = await degradeEquippedDurability('p1', -1);
    expect(result).toEqual([]);
  });

  it('degrades durability on equipped items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', 1);
    expect(losses).toHaveLength(1);
    expect(losses[0].newDurability).toBe(49);
    expect(losses[0].isBroken).toBe(false);
  });

  it('detects broken items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 1,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', 1);
    expect(losses[0].isBroken).toBe(true);
    expect(losses[0].newDurability).toBe(0);
  });

  it('does not flag already-broken items as newly broken', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 0,
          maxDurability: 100,
          template: { name: 'Sword', itemType: 'weapon', maxDurability: 100 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', 1);
    expect(losses[0].isBroken).toBe(false); // already was broken
  });

  it('detects warning threshold crossing', async () => {
    const maxDur = 100;
    const threshold = maxDur * DURABILITY_CONSTANTS.WARNING_THRESHOLD; // 10
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: threshold + 1, // 11
          maxDurability: maxDur,
          template: { name: 'Shield', itemType: 'armor', maxDurability: maxDur },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', 1);
    expect(losses[0].crossedWarningThreshold).toBe(true);
  });

  it('deduplicates same item in multiple slots', async () => {
    const item = {
      id: 'ring-1',
      currentDurability: 50,
      maxDurability: 100,
      template: { name: 'Ring', itemType: 'armor', maxDurability: 100 },
    };
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      { item: { ...item } },
      { item: { ...item } }, // same item in different slot
    ]);
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', 1);
    expect(losses).toHaveLength(1); // only processed once
  });

  it('normalizes missing durability to template max', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: null,
          maxDurability: null,
          template: { name: 'Axe', itemType: 'weapon', maxDurability: 80 },
        },
      ])
    );
    mockPrisma.item.update.mockResolvedValue({});

    const losses = await degradeEquippedDurability('p1', 1);
    expect(losses[0].maxDurability).toBe(80);
    expect(losses[0].newDurability).toBe(79);
    // Should have been called twice: once to normalize, once to update
    expect(mockPrisma.item.update).toHaveBeenCalledTimes(2);
  });

  it('skips non-weapon/armor items', async () => {
    mockPrisma.playerEquipment.findMany.mockResolvedValue(
      makeEquipped([
        {
          id: 'item-1',
          currentDurability: 50,
          maxDurability: 100,
          template: { name: 'Potion', itemType: 'consumable', maxDurability: 100 },
        },
      ])
    );

    const losses = await degradeEquippedDurability('p1', 1);
    expect(losses).toHaveLength(0);
  });
});
