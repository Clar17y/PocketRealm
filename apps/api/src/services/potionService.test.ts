import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mockPrisma } from '../__test__/setup';
import { buildPotionPool, deductConsumedPotions } from './potionService';

describe('potionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildPotionPool', () => {
    it('returns empty array when player has no consumables', async () => {
      mockPrisma.item.findMany.mockResolvedValue([]);
      const result = await buildPotionPool('player-1', 200);
      expect(result).toEqual([]);
    });

    it('builds potions from heal_flat consumables', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 2,
          template: {
            id: 'tmpl-1',
            name: 'Minor Health Potion',
            consumableEffect: { type: 'heal_flat', value: 50 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Minor Health Potion',
        healAmount: 50,
        templateId: 'tmpl-1',
        potionType: 'hp',
      });
    });

    it('calculates percent-based healing from maxHp', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 1,
          template: {
            id: 'tmpl-2',
            name: 'Recovery Potion',
            consumableEffect: { type: 'heal_percent', value: 0.5 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(1);
      expect(result[0].healAmount).toBe(100); // 200 * 0.5
    });

    it('skips items with no consumable effect', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 1,
          template: {
            id: 'tmpl-3',
            name: 'Sword',
            consumableEffect: null,
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toEqual([]);
    });

    it('expands quantity into individual potion entries', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 5,
          template: {
            id: 'tmpl-1',
            name: 'Minor Health Potion',
            consumableEffect: { type: 'heal_flat', value: 50 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(5);
    });
  });

  describe('deductConsumedPotions', () => {
    it('does nothing when consumed list is empty', async () => {
      await deductConsumedPotions('player-1', []);
      expect(mockPrisma.item.findFirst).not.toHaveBeenCalled();
    });

    it('deletes item when quantity consumed equals stack size', async () => {
      mockPrisma.item.findFirst.mockResolvedValue({
        id: 'item-1',
        quantity: 2,
      });

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 },
        { templateId: 'tmpl-1', name: 'Potion', round: 5, healAmount: 50 },
      ]);

      expect(mockPrisma.item.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
    });

    it('decrements quantity when not fully consumed', async () => {
      mockPrisma.item.findFirst.mockResolvedValue({
        id: 'item-1',
        quantity: 5,
      });

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 },
      ]);

      expect(mockPrisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: 4 },
      });
    });

    it('aggregates multiple potions of same template', async () => {
      mockPrisma.item.findFirst.mockResolvedValue({
        id: 'item-1',
        quantity: 10,
      });

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 },
        { templateId: 'tmpl-1', name: 'Potion', round: 3, healAmount: 50 },
        { templateId: 'tmpl-1', name: 'Potion', round: 7, healAmount: 50 },
      ]);

      // Should only do one findFirst call for the single template
      expect(mockPrisma.item.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: 7 },
      });
    });

    it('skips items not found in DB', async () => {
      mockPrisma.item.findFirst.mockResolvedValue(null);

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-missing', name: 'Ghost Potion', round: 1, healAmount: 50 },
      ]);

      expect(mockPrisma.item.delete).not.toHaveBeenCalled();
      expect(mockPrisma.item.update).not.toHaveBeenCalled();
    });

    it('uses provided transaction client', async () => {
      const fakeTx = {
        item: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
      };
      fakeTx.item.findFirst.mockResolvedValue({ id: 'item-1', quantity: 3 });

      await deductConsumedPotions(
        'player-1',
        [{ templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 }],
        fakeTx as any,
      );

      expect(fakeTx.item.findFirst).toHaveBeenCalled();
      expect(fakeTx.item.update).toHaveBeenCalled();
      expect(mockPrisma.item.findFirst).not.toHaveBeenCalled();
    });
  });
});
