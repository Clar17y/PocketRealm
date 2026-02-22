import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import {
  addStackableItem,
  getTotalQuantityByTemplate,
  consumeItemsByTemplate,
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
});
