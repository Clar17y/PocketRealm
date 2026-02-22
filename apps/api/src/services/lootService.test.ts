import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./inventoryService', () => ({
  addStackableItem: vi.fn().mockResolvedValue({ itemId: 'stack-1', quantity: 1 }),
}));

import { mockPrisma } from '../__test__/setup';
import { rollAndGrantLoot } from './lootService';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rollAndGrantLoot', () => {
  it('returns empty array when no drop entries', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([]);

    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toEqual([]);
  });

  it('returns empty when roll exceeds drop chance', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    mockPrisma.dropTable.findMany.mockResolvedValue([
      {
        dropChance: { toNumber: () => 0.5 },
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplateId: 'tpl-1',
        itemTemplate: { stackable: true, itemType: 'material' },
      },
    ]);

    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toEqual([]);
  });

  it('grants stackable loot when drop succeeds', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01); // always succeeds
    mockPrisma.dropTable.findMany.mockResolvedValue([
      {
        dropChance: { toNumber: () => 0.5 },
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplateId: 'tpl-1',
        itemTemplate: { stackable: true, itemType: 'material' },
      },
    ]);

    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toHaveLength(1);
    expect(drops[0].itemTemplateId).toBe('tpl-1');
    expect(drops[0].rarity).toBe('common');
  });

  it('creates unique equipment items with rarity', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    mockPrisma.dropTable.findMany.mockResolvedValue([
      {
        dropChance: { toNumber: () => 1.0 },
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplateId: 'tpl-sword',
        itemTemplate: {
          stackable: false,
          itemType: 'weapon',
          maxDurability: 100,
          baseStats: { attack: 5 },
          slot: 'main_hand',
        },
      },
    ]);
    mockPrisma.item.create.mockResolvedValue({});

    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toHaveLength(1);
    expect(mockPrisma.item.create).toHaveBeenCalled();
  });

  it('skips entries with 0 drop chance', async () => {
    mockPrisma.dropTable.findMany.mockResolvedValue([
      {
        dropChance: { toNumber: () => 0 },
        minQuantity: 1,
        maxQuantity: 1,
        itemTemplateId: 'tpl-1',
        itemTemplate: { stackable: true, itemType: 'material' },
      },
    ]);

    const drops = await rollAndGrantLoot('p1', 'mob-1', 5);
    expect(drops).toEqual([]);
  });
});
