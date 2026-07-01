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

    it('queries only backpack consumables for combat potions', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 1,
          template: {
            id: 'tmpl-mana',
            name: 'Mana Potion',
            consumableEffect: { type: 'restore_mana', value: 40 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);

      expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
        where: {
          ownerId: 'player-1',
          inStash: false,
          template: { itemType: 'consumable' },
        },
        include: { template: true },
      });
      expect(result).toHaveLength(1);
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

    it('builds cleanse potions from cleanse_magic_dot consumables', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 3,
          template: {
            id: 'tmpl-antivenom',
            name: 'Cleansing Potion',
            consumableEffect: { type: 'cleanse_magic_dot' },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        name: 'Cleansing Potion',
        healAmount: 0,
        templateId: 'tmpl-antivenom',
        potionType: 'cleanse',
      });
    });

    it('builds buff_attack potions with duration and value', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 1,
          template: {
            id: 'tmpl-elixir',
            name: 'Elixir of Power',
            consumableEffect: { type: 'buff_attack', value: 0.25, duration: 5 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Elixir of Power',
        healAmount: 0,
        templateId: 'tmpl-elixir',
        potionType: 'buff_attack',
        buffDuration: 5,
        buffValue: 0.25,
      });
    });

    it('builds buff_defence potions with duration and value', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        {
          quantity: 2,
          template: {
            id: 'tmpl-resist',
            name: 'Resist Potion',
            consumableEffect: { type: 'buff_defence', value: 15, duration: 5 },
          },
        },
      ]);

      const result = await buildPotionPool('player-1', 200);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Resist Potion',
        healAmount: 0,
        templateId: 'tmpl-resist',
        potionType: 'buff_defence',
        buffDuration: 5,
        buffValue: 15,
      });
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
      expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
    });

    it('deletes item when quantity consumed equals stack size', async () => {
      mockPrisma.item.findMany.mockResolvedValue([{
        id: 'item-1',
        quantity: 2,
      }]);

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 },
        { templateId: 'tmpl-1', name: 'Potion', round: 5, healAmount: 50 },
      ]);

      expect(mockPrisma.item.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
    });

    it('decrements quantity when not fully consumed', async () => {
      mockPrisma.item.findMany.mockResolvedValue([{
        id: 'item-1',
        quantity: 5,
      }]);

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 },
      ]);

      expect(mockPrisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: 4 },
      });
    });

    it('deducts consumed potions from backpack stacks only', async () => {
      mockPrisma.item.findMany.mockResolvedValue([{
        id: 'item-1',
        quantity: 1,
      }]);

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-mana', name: 'Mana Potion', round: 1, healAmount: 40 },
      ]);

      expect(mockPrisma.item.findMany).toHaveBeenCalledWith({
        where: { ownerId: 'player-1', templateId: 'tmpl-mana', inStash: false },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, quantity: true },
      });
    });

    it('deducts consumed potions across duplicate backpack stacks', async () => {
      mockPrisma.item.findMany.mockResolvedValue([
        { id: 'item-1', quantity: 1 },
        { id: 'item-2', quantity: 3 },
      ]);

      const result = await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-mana', name: 'Mana Potion', round: 1, healAmount: 40 },
        { templateId: 'tmpl-mana', name: 'Mana Potion', round: 3, healAmount: 40 },
      ]);

      expect(mockPrisma.item.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
      expect(mockPrisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-2' },
        data: { quantity: 2 },
      });
      expect(result).toEqual({
        fullyConsumedIds: ['item-1'],
        partiallyConsumedIds: ['item-2'],
      });
    });

    it('aggregates multiple potions of same template', async () => {
      mockPrisma.item.findMany.mockResolvedValue([{
        id: 'item-1',
        quantity: 10,
      }]);

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 },
        { templateId: 'tmpl-1', name: 'Potion', round: 3, healAmount: 50 },
        { templateId: 'tmpl-1', name: 'Potion', round: 7, healAmount: 50 },
      ]);

      // Should only do one inventory query for the single template
      expect(mockPrisma.item.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.item.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: 7 },
      });
    });

    it('skips items not found in DB', async () => {
      mockPrisma.item.findMany.mockResolvedValue([]);

      await deductConsumedPotions('player-1', [
        { templateId: 'tmpl-missing', name: 'Ghost Potion', round: 1, healAmount: 50 },
      ]);

      expect(mockPrisma.item.delete).not.toHaveBeenCalled();
      expect(mockPrisma.item.update).not.toHaveBeenCalled();
    });

    it('uses provided transaction client', async () => {
      const fakeTx = {
        item: { findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
      };
      fakeTx.item.findMany.mockResolvedValue([{ id: 'item-1', quantity: 3 }]);

      await deductConsumedPotions(
        'player-1',
        [{ templateId: 'tmpl-1', name: 'Potion', round: 1, healAmount: 50 }],
        fakeTx as any,
      );

      expect(fakeTx.item.findMany).toHaveBeenCalled();
      expect(fakeTx.item.update).toHaveBeenCalled();
      expect(mockPrisma.item.findMany).not.toHaveBeenCalled();
    });
  });
});
