import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import {
  addStackableItem,
  getTotalQuantityByTemplate,
  consumeItemsByTemplate,
  consumeItemsByTemplateTx,
  getUsedSlots,
  getPlayerCapacity,
} from './inventoryService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('addStackableItem', () => {
  it('throws for invalid quantity (0)', async () => {
    await expect(addStackableItem('p1', 'tpl-1', 0)).rejects.toThrow('Quantity must be a positive integer');
  });

  it('throws for negative quantity', async () => {
    await expect(addStackableItem('p1', 'tpl-1', -1)).rejects.toThrow('Quantity must be a positive integer');
  });

  it('throws for non-integer quantity', async () => {
    await expect(addStackableItem('p1', 'tpl-1', 1.5)).rejects.toThrow('Quantity must be a positive integer');
  });

  it('throws 404 when template not found', async () => {
    mockPrisma.itemTemplate.findUnique.mockResolvedValue(null);

    await expect(addStackableItem('p1', 'missing', 1)).rejects.toThrow('Item template not found');
  });

  it('throws when template is not stackable', async () => {
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', stackable: false });

    await expect(addStackableItem('p1', 'tpl-1', 1)).rejects.toThrow('Template is not stackable');
  });

  it('updates existing stack', async () => {
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', stackable: true });
    mockPrisma.item.findFirst.mockResolvedValue({ id: 'item-1', quantity: 5 });
    mockPrisma.item.update.mockResolvedValue({ id: 'item-1', quantity: 8 });

    const result = await addStackableItem('p1', 'tpl-1', 3);
    expect(result.itemId).toBe('item-1');
    expect(result.quantity).toBe(8);
    expect(mockPrisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 8 } })
    );
  });

  it('creates new stack when none exists', async () => {
    mockPrisma.itemTemplate.findUnique.mockResolvedValue({ id: 'tpl-1', stackable: true });
    mockPrisma.item.findFirst.mockResolvedValue(null);
    mockPrisma.item.create.mockResolvedValue({ id: 'new-item', quantity: 5 });

    const result = await addStackableItem('p1', 'tpl-1', 5);
    expect(result.itemId).toBe('new-item');
    expect(result.quantity).toBe(5);
  });
});

describe('getTotalQuantityByTemplate', () => {
  it('sums quantities across multiple items', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { quantity: 3 },
      { quantity: 7 },
    ]);

    const total = await getTotalQuantityByTemplate('p1', 'tpl-1');
    expect(total).toBe(10);
  });

  it('returns 0 when no items found', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);

    const total = await getTotalQuantityByTemplate('p1', 'tpl-1');
    expect(total).toBe(0);
  });
});

describe('consumeItemsByTemplate', () => {
  it('throws for invalid quantity', async () => {
    await expect(consumeItemsByTemplate('p1', 'tpl-1', 0)).rejects.toThrow(
      'Quantity must be a positive integer'
    );
  });

  it('consumes from a single stack partially', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 10 },
    ]);
    mockPrisma.item.update.mockResolvedValue({});

    await consumeItemsByTemplate('p1', 'tpl-1', 3);

    expect(mockPrisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 7 } })
    );
  });

  it('deletes stack when fully consumed', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 5 },
    ]);
    mockPrisma.item.delete.mockResolvedValue({});

    await consumeItemsByTemplate('p1', 'tpl-1', 5);

    expect(mockPrisma.item.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
  });

  it('consumes across multiple stacks FIFO', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 3 },
      { id: 'item-2', quantity: 5 },
    ]);
    mockPrisma.item.delete.mockResolvedValue({});
    mockPrisma.item.update.mockResolvedValue({});

    await consumeItemsByTemplate('p1', 'tpl-1', 4);

    expect(mockPrisma.item.delete).toHaveBeenCalledWith({ where: { id: 'item-1' } });
    expect(mockPrisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'item-2' },
        data: { quantity: 4 },
      })
    );
  });

  it('throws when insufficient items', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 2 },
    ]);
    mockPrisma.item.delete.mockResolvedValue({});

    await expect(consumeItemsByTemplate('p1', 'tpl-1', 5)).rejects.toThrow(
      'Insufficient materials'
    );
  });

  it('locks matching item rows before transactional consumption reads quantities', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);
    mockPrisma.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 10 },
    ]);
    mockPrisma.item.update.mockResolvedValue({});

    await consumeItemsByTemplateTx(mockPrisma as never, 'p1', 'tpl-1', 3);

    expect(mockPrisma.$queryRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        strings: expect.arrayContaining([expect.stringContaining('FOR UPDATE')]),
      }),
    );
    expect(mockPrisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockPrisma.item.findMany.mock.invocationCallOrder[0],
    );
    expect(mockPrisma.item.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { quantity: 7 } }),
    );
  });
});

describe('getUsedSlots', () => {
  it('counts non-stackable items as 1 slot each', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { templateId: 't1', template: { stackable: false } },
      { templateId: 't2', template: { stackable: false } },
      { templateId: 't3', template: { stackable: false } },
    ]);
    const result = await getUsedSlots('p1');
    expect(result).toBe(3);
  });

  it('counts each stackable template as 1 slot', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { templateId: 'stack-a', template: { stackable: true } },
      { templateId: 'stack-a', template: { stackable: true } },
      { templateId: 'stack-b', template: { stackable: true } },
    ]);
    const result = await getUsedSlots('p1');
    expect(result).toBe(2);
  });

  it('counts mixed stackable and non-stackable correctly', async () => {
    mockPrisma.item.findMany.mockResolvedValue([
      { templateId: 'stack-a', template: { stackable: true } },
      { templateId: 'stack-a', template: { stackable: true } },
      { templateId: 'non-stack-1', template: { stackable: false } },
      { templateId: 'non-stack-2', template: { stackable: false } },
    ]);
    const result = await getUsedSlots('p1');
    expect(result).toBe(3); // 1 stackable group + 2 non-stackable
  });

  it('returns 0 when no items', async () => {
    mockPrisma.item.findMany.mockResolvedValue([]);
    expect(await getUsedSlots('p1')).toBe(0);
  });
});

describe('getPlayerCapacity', () => {
  it('returns base capacity with no equipment', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.playerEquipment.findMany.mockResolvedValue([]);
    // BASE_CAPACITY = 24
    expect(await getPlayerCapacity('p1')).toBe(24);
  });

  it('includes backpack tier bonus', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      { slot: 'backpack', item: { rarity: 'common', template: { tier: 2 }, bonusStats: null } },
    ]);
    // 24 base + 2*8 tier = 40
    expect(await getPlayerCapacity('p1')).toBe(40);
  });

  it('includes backpack rarity bonus', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      { slot: 'backpack', item: { rarity: 'rare', template: { tier: 1 }, bonusStats: null } },
    ]);
    // 24 base + 1*8 tier + 2*2 rarity(rare=index 2) = 36
    expect(await getPlayerCapacity('p1')).toBe(36);
  });

  it('includes belt slot bonus', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      { slot: 'belt', item: { rarity: 'common', template: { tier: 1 }, bonusStats: { inventorySlots: 4 } } },
    ]);
    // 24 base + 4 belt bonus = 28
    expect(await getPlayerCapacity('p1')).toBe(28);
  });

  it('combines backpack and belt bonuses', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ isPremium: false });
    mockPrisma.playerEquipment.findMany.mockResolvedValue([
      { slot: 'backpack', item: { rarity: 'common', template: { tier: 1 }, bonusStats: null } },
      { slot: 'belt', item: { rarity: 'common', template: { tier: 1 }, bonusStats: { inventorySlots: 6 } } },
    ]);
    // 24 base + 1*8 tier + 6 belt = 38
    expect(await getPlayerCapacity('p1')).toBe(38);
  });

  it('includes Champion bonus slots for premium players', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      account: {
        isPremium: true,
        premiumExpiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
    mockPrisma.playerEquipment.findMany.mockResolvedValue([]);

    expect(await getPlayerCapacity('p1')).toBe(32);
  });

  it('does not include Champion bonus slots when premium entitlement is expired', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({
      account: {
        isPremium: true,
        premiumExpiresAt: new Date('2025-12-31T23:59:59.000Z'),
      },
    });
    mockPrisma.playerEquipment.findMany.mockResolvedValue([]);

    expect(await getPlayerCapacity('p1')).toBe(24);
  });
});
