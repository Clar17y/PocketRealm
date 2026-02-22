import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./hpService', () => ({
  getHpState: vi.fn(),
}));

import { mockPrisma } from '../__test__/setup';
import { getHpState } from './hpService';
import { useConsumable } from './consumableService';
const mockGetHpState = vi.mocked(getHpState);
const now = new Date('2025-06-01T12:00:00Z');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useConsumable', () => {
  it('throws 404 when item not found', async () => {
    mockPrisma.item.findUnique.mockResolvedValue(null);

    await expect(useConsumable('p1', 'missing', now)).rejects.toThrow('Item not found');
  });

  it('throws when item not owned by player', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'other-player',
      template: { itemType: 'consumable', name: 'Potion' },
    });

    await expect(useConsumable('p1', 'item-1', now)).rejects.toThrow('Item not found');
  });

  it('throws when item is not consumable', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      template: { itemType: 'weapon', name: 'Sword' },
    });

    await expect(useConsumable('p1', 'item-1', now)).rejects.toThrow('Item is not a consumable');
  });

  it('throws when consumable has no effect', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      template: { itemType: 'consumable', name: 'Empty Potion', consumableEffect: null },
    });

    await expect(useConsumable('p1', 'item-1', now)).rejects.toThrow('no usable effect');
  });

  it('throws when recovering', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: {
        itemType: 'consumable',
        name: 'Health Potion',
        consumableEffect: { type: 'heal_flat', value: 50 },
      },
    });
    mockGetHpState.mockResolvedValue({
      currentHp: 0,
      maxHp: 100,
      regenPerSecond: 0.4,
      lastHpRegenAt: now.toISOString(),
      isRecovering: true,
      recoveryCost: 100,
    });

    await expect(useConsumable('p1', 'item-1', now)).rejects.toThrow(
      'Cannot use potions while knocked out'
    );
  });

  it('throws when already at full HP', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: {
        itemType: 'consumable',
        name: 'Health Potion',
        consumableEffect: { type: 'heal_flat', value: 50 },
      },
    });
    mockGetHpState.mockResolvedValue({
      currentHp: 100,
      maxHp: 100,
      regenPerSecond: 0.4,
      lastHpRegenAt: now.toISOString(),
      isRecovering: false,
      recoveryCost: null,
    });

    await expect(useConsumable('p1', 'item-1', now)).rejects.toThrow('Already at full HP');
  });

  it('heals with flat healing and decrements quantity', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 3,
      template: {
        itemType: 'consumable',
        name: 'Health Potion',
        consumableEffect: { type: 'heal_flat', value: 50 },
      },
    });
    mockGetHpState.mockResolvedValue({
      currentHp: 50,
      maxHp: 100,
      regenPerSecond: 0.4,
      lastHpRegenAt: now.toISOString(),
      isRecovering: false,
      recoveryCost: null,
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      currentHp: 50,
      lastHpRegenAt: now,
      isRecovering: false,
    });
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.update.mockResolvedValue({ quantity: 2 });

    const result = await useConsumable('p1', 'item-1', now);
    expect(result.healedAmount).toBe(50);
    expect(result.currentHp).toBe(100);
    expect(result.remainingQuantity).toBe(2);
  });

  it('heals with percentage healing', async () => {
    mockPrisma.item.findUnique.mockResolvedValue({
      id: 'item-1',
      ownerId: 'p1',
      quantity: 1,
      template: {
        itemType: 'consumable',
        name: 'Recovery Potion',
        consumableEffect: { type: 'heal_percent', value: 0.5 },
      },
    });
    mockGetHpState.mockResolvedValue({
      currentHp: 10,
      maxHp: 100,
      regenPerSecond: 0.4,
      lastHpRegenAt: now.toISOString(),
      isRecovering: false,
      recoveryCost: null,
    });
    mockPrisma.player.findUnique.mockResolvedValue({
      currentHp: 10,
      lastHpRegenAt: now,
      isRecovering: false,
    });
    mockPrisma.player.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.item.delete.mockResolvedValue({});

    const result = await useConsumable('p1', 'item-1', now);
    expect(result.currentHp).toBe(60); // 10 + floor(100 * 0.5) = 60
    expect(result.remainingQuantity).toBeNull(); // deleted
  });
});
