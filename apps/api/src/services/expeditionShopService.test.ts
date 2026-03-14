import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./inventoryService', () => ({
  getInventoryState: vi.fn().mockResolvedValue({ usedSlots: 5, capacity: 30, availableSlots: 25 }),
}));

import { mockPrisma } from '../__test__/setup';
import { EXPEDITION_SHOP_ITEMS, EXPEDITION_CONSTANTS } from '@pocketrealm/shared';
import { getShopItems, getPlayerTokens, purchaseShopItem } from './expeditionShopService';
import { getInventoryState } from './inventoryService';

describe('getShopItems', () => {
  it('returns all 15 expedition shop items', () => {
    const items = getShopItems();
    expect(items).toBe(EXPEDITION_SHOP_ITEMS);
    expect(items).toHaveLength(15);
  });
});

describe('getPlayerTokens', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns token balance from player record', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ expeditionTokens: 42 });

    const tokens = await getPlayerTokens('p1');

    expect(tokens).toBe(42);
    expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { expeditionTokens: true },
    });
  });

  it('throws NOT_FOUND when player does not exist', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    await expect(getPlayerTokens('missing')).rejects.toThrow('Player not found');
  });
});

describe('purchaseShopItem', () => {
  const sampleItem = EXPEDITION_SHOP_ITEMS[0]; // vanguard_head, cost 80

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks for a successful purchase
    mockPrisma.player.findUnique.mockResolvedValue({
      expeditionTokens: 200,
      currentZoneId: 'zone-1',
    });
    mockPrisma.zone.findUnique.mockResolvedValue({ zoneType: 'town' });
    (getInventoryState as ReturnType<typeof vi.fn>).mockResolvedValue({
      usedSlots: 5, capacity: 30, availableSlots: 25,
    });
    mockPrisma.itemTemplate.findFirst.mockResolvedValue({
      id: 'tmpl-1',
      name: sampleItem.name,
      maxDurability: 100,
    });
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({ expeditionTokens: 120 });
    mockPrisma.item.create.mockResolvedValue({
      id: 'item-1',
      templateId: 'tmpl-1',
      ownerId: 'p1',
      rarity: 'epic',
      isSoulbound: true,
    });
  });

  it('succeeds: tokens deducted, item created soulbound', async () => {
    const result = await purchaseShopItem('p1', sampleItem.id);

    expect(result.item.name).toBe(sampleItem.name);
    expect(result.item.slot).toBe(sampleItem.slot);
    expect(result.item.isSoulbound).toBe(true);
    expect(result.item.rarity).toBe('epic');
    expect(result.tokensRemaining).toBe(120);

    // Token deduction via optimistic lock (race-condition safe)
    expect(mockPrisma.player.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', expeditionTokens: { gte: sampleItem.tokenCost } },
      data: { expeditionTokens: { decrement: sampleItem.tokenCost } },
    });

    // Item created with soulbound flag and doubled durability
    expect(mockPrisma.item.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'p1',
        templateId: 'tmpl-1',
        rarity: 'epic',
        isSoulbound: true,
        maxDurability: 100 * EXPEDITION_CONSTANTS.SOULBOUND_DURABILITY_MULTIPLIER,
        currentDurability: 100 * EXPEDITION_CONSTANTS.SOULBOUND_DURABILITY_MULTIPLIER,
      }),
    });
  });

  it('throws INVALID_ITEM for unknown item id', async () => {
    await expect(purchaseShopItem('p1', 'nonexistent')).rejects.toThrow('Invalid shop item');
  });

  it('throws INSUFFICIENT_TOKENS when balance is too low', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      expeditionTokens: 10, // less than the 80-token cost
      currentZoneId: 'zone-1',
    });

    await expect(purchaseShopItem('p1', sampleItem.id)).rejects.toThrow('Insufficient expedition tokens');
  });

  it('throws NOT_IN_TOWN when player is in a wild zone', async () => {
    mockPrisma.zone.findUnique.mockResolvedValue({ zoneType: 'wild' });

    await expect(purchaseShopItem('p1', sampleItem.id)).rejects.toThrow('Must be in a town');
  });

  it('throws NOT_IN_TOWN when player has no current zone', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      expeditionTokens: 200,
      currentZoneId: null,
    });

    await expect(purchaseShopItem('p1', sampleItem.id)).rejects.toThrow('Must be in a town');
  });

  it('throws INVENTORY_FULL when inventory is at capacity', async () => {
    (getInventoryState as ReturnType<typeof vi.fn>).mockResolvedValue({
      usedSlots: 30, capacity: 30, availableSlots: 0,
    });

    await expect(purchaseShopItem('p1', sampleItem.id)).rejects.toThrow('Inventory is full');
  });

  it('throws TEMPLATE_NOT_FOUND when ItemTemplate is missing', async () => {
    mockPrisma.itemTemplate.findFirst.mockResolvedValue(null);

    await expect(purchaseShopItem('p1', sampleItem.id)).rejects.toThrow('Item template not found');
  });
});
