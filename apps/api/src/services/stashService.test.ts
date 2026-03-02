import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { depositItem, withdrawItem, listStash } from './stashService';

// Mock inventoryService capacity functions
vi.mock('./inventoryService', async (importOriginal) => {
  const original = await importOriginal<typeof import('./inventoryService')>();
  return {
    ...original,
    getInventoryState: vi.fn(),
  };
});

import { getInventoryState } from './inventoryService';

const mockGetInventoryState = getInventoryState as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  // Default: backpack has space
  mockGetInventoryState.mockResolvedValue({ usedSlots: 5, capacity: 24, availableSlots: 19 });
});

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    ownerId: 'p1',
    templateId: 'tpl-1',
    rarity: 'common',
    quantity: 1,
    currentDurability: 100,
    maxDurability: 100,
    inStash: false,
    template: { stackable: false },
    equipment: [],
    ...overrides,
  };
}

describe('depositItem', () => {
  it('moves non-stackable item to stash', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem());
    mockPrisma.item.update.mockResolvedValue({});

    await depositItem('p1', 'item-1');

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { inStash: true },
    });
  });

  it('throws when item not found', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);
    await expect(depositItem('p1', 'missing')).rejects.toThrow('Item not found');
  });

  it('throws when item belongs to another player', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ ownerId: 'other' }));
    await expect(depositItem('p1', 'item-1')).rejects.toThrow('Item not found');
  });

  it('throws when item is equipped', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ equipment: [{ slot: 'main_hand' }] })
    );
    await expect(depositItem('p1', 'item-1')).rejects.toThrow('Cannot stash equipped items');
  });

  it('throws when item is already in stash', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ inStash: true }));
    await expect(depositItem('p1', 'item-1')).rejects.toThrow('Item is already in stash');
  });

  it('deposits full stackable item to stash', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ quantity: 5, template: { stackable: true } })
    );
    mockPrisma.item.update.mockResolvedValue({});

    await depositItem('p1', 'item-1', 5);

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { inStash: true },
    });
  });

  it('splits partial stackable deposit', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ quantity: 10, template: { stackable: true } })
    );
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.item.findFirst.mockResolvedValue(null);
    mockPrisma.item.create.mockResolvedValue({});

    await depositItem('p1', 'item-1', 3);

    // Reduce original stack
    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 7 },
    });
    // Create new stash stack
    expect(mockPrisma.item.create).toHaveBeenCalled();
  });

  it('merges partial stackable into existing stash stack', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ quantity: 10, template: { stackable: true } })
    );
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'stash-item', quantity: 5 });

    await depositItem('p1', 'item-1', 3);

    // Merge into existing stash stack
    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'stash-item' },
      data: { quantity: 8 },
    });
  });
});

describe('withdrawItem', () => {
  it('moves non-stackable item from stash', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ inStash: true }));
    mockPrisma.item.update.mockResolvedValue({});

    await withdrawItem('p1', 'item-1');

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { inStash: false },
    });
  });

  it('throws when backpack is full', async () => {
    mockGetInventoryState.mockResolvedValue({ usedSlots: 24, capacity: 24, availableSlots: 0 });

    await expect(withdrawItem('p1', 'item-1')).rejects.toThrow('Backpack is full');
  });

  it('throws when item not in stash', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ inStash: false }));
    await expect(withdrawItem('p1', 'item-1')).rejects.toThrow('Item is not in stash');
  });

  it('throws when item not found', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);
    await expect(withdrawItem('p1', 'missing')).rejects.toThrow('Item not found');
  });

  it('splits partial stackable withdraw', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ inStash: true, quantity: 10, template: { stackable: true } })
    );
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.item.findFirst.mockResolvedValue(null);
    mockPrisma.item.create.mockResolvedValue({});

    await withdrawItem('p1', 'item-1', 4);

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 6 },
    });
    expect(mockPrisma.item.create).toHaveBeenCalled();
  });

  it('merges partial stackable into existing backpack stack', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ inStash: true, quantity: 10, template: { stackable: true } })
    );
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'bp-item', quantity: 3 });

    await withdrawItem('p1', 'item-1', 5);

    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'bp-item' },
      data: { quantity: 8 },
    });
  });
});

describe('listStash', () => {
  it('returns only stashed items', async () => {
    const stashedItems = [
      makeItem({ id: 'stash-1', inStash: true }),
      makeItem({ id: 'stash-2', inStash: true }),
    ];
    mockPrisma.item.findMany.mockResolvedValue(stashedItems);

    const result = await listStash('p1');

    expect(result).toEqual(stashedItems);
    expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
      where: { ownerId: 'p1', inStash: true },
      include: { template: true },
    });
  });

  it('returns empty array when no stashed items', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    const result = await listStash('p1');
    expect(result).toEqual([]);
  });
});
