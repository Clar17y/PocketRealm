import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { sellItem, sellBulk } from './sellService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    ownerId: 'p1',
    rarity: 'common',
    quantity: 1,
    currentDurability: 100,
    maxDurability: 100,
    template: { sellPrice: 10, tier: 1 },
    equipment: [],
    ...overrides,
  };
}

describe('sellItem', () => {
  it('throws 404 when item not found', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);
    await expect(sellItem('p1', 'missing')).rejects.toThrow('Item not found');
  });

  it('throws 404 when item belongs to another player', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ ownerId: 'other-player' }));
    await expect(sellItem('p1', 'item-1')).rejects.toThrow('Item not found');
  });

  it('throws when item is equipped', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ equipment: [{ slot: 'main_hand' }] })
    );
    await expect(sellItem('p1', 'item-1')).rejects.toThrow('Cannot sell equipped items');
  });

  it('throws when item has no sell price', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ template: { sellPrice: null, tier: 1 } })
    );
    await expect(sellItem('p1', 'item-1')).rejects.toThrow('Item cannot be sold');
  });

  it('throws for invalid quantity', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ quantity: 5 }));
    await expect(sellItem('p1', 'item-1', 10)).rejects.toThrow('Invalid quantity');
  });

  it('throws for zero quantity', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ quantity: 5 }));
    await expect(sellItem('p1', 'item-1', 0)).rejects.toThrow('Invalid quantity');
  });

  it('sells non-stackable item and grants gold', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem());
    mockPrisma.item.delete.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({ gold: 110 });

    const result = await sellItem('p1', 'item-1');

    expect(result.goldEarned).toBe(10);
    expect(result.newGold).toBe(110);
    expect(mockPrisma.item.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('sells partial stack and reduces quantity', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ quantity: 10 }));
    mockPrisma.item.update.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({ gold: 50 });

    const result = await sellItem('p1', 'item-1', 3);

    expect(result.goldEarned).toBe(30); // 10 base * 1 rarity * 3 qty
    expect(mockPrisma.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 7 },
    });
  });

  it('applies rarity multiplier', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(makeItem({ rarity: 'rare' }));
    mockPrisma.item.delete.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({ gold: 140 });

    const result = await sellItem('p1', 'item-1');

    // sellPrice 10 * rare multiplier 4 = 40
    expect(result.goldEarned).toBe(40);
  });
});

describe('sellBulk', () => {
  it('sells multiple items and sums gold', async () => {
    mockPrisma.item.findUnique
      .mockResolvedValueOnce(makeItem({ id: 'i1', quantity: 1 }))
      .mockResolvedValueOnce(makeItem({ id: 'i2', quantity: 2, template: { sellPrice: 5, tier: 1 } }));
    mockPrisma.item.delete.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({ gold: 120 });

    const result = await sellBulk('p1', ['i1', 'i2']);

    expect(result.totalGoldEarned).toBe(20); // 10*1 + 5*2
    expect(result.soldCount).toBe(2);
    expect(result.newGold).toBe(120);
  });

  it('skips items that are not found', async () => {
    mockPrisma.item.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeItem({ id: 'i2' }));
    mockPrisma.item.delete.mockResolvedValue({});
    mockPrisma.player.update.mockResolvedValue({ gold: 10 });

    const result = await sellBulk('p1', ['missing', 'i2']);

    expect(result.soldCount).toBe(1);
    expect(result.totalGoldEarned).toBe(10);
  });

  it('skips equipped items', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ equipment: [{ slot: 'main_hand' }] })
    );
    mockPrisma.player.update.mockResolvedValue({ gold: 0 });

    const result = await sellBulk('p1', ['item-1']);

    expect(result.soldCount).toBe(0);
    expect(result.totalGoldEarned).toBe(0);
  });

  it('skips items with no sell price', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(
      makeItem({ template: { sellPrice: null, tier: 1 } })
    );
    mockPrisma.player.update.mockResolvedValue({ gold: 0 });

    const result = await sellBulk('p1', ['item-1']);

    expect(result.soldCount).toBe(0);
    expect(result.totalGoldEarned).toBe(0);
  });
});
