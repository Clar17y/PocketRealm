import { describe, it, expect, vi } from 'vitest';
import { applyStateUpdates, type StateSetters } from './applyStateUpdates';
import type { StateUpdates } from '@pocketrealm/shared';

function makeSetters(): StateSetters {
  return {
    setInventory: vi.fn((updater) => {
      if (typeof updater === 'function') return updater([]);
      return updater;
    }),
    setInventoryCapacity: vi.fn(),
    setInventoryUsedSlots: vi.fn(),
    setEquipment: vi.fn(),
    patchEquipmentDurability: vi.fn(),
    setSkills: vi.fn(),
    setHpState: vi.fn(),
    setStaminaState: vi.fn(),
    setManaState: vi.fn(),
    setGold: vi.fn(),
    setActiveBuffs: vi.fn(),
    setCharacterProgression: vi.fn(),
    setMaterialTotals: vi.fn(),
    setActiveEncounterSiteId: vi.fn(),
    setActiveZoneId: vi.fn(),
  };
}

const mockItem = {
  id: 'item-1',
  templateId: 'tpl-1',
  ownerId: 'player-1',
  rarity: 'common' as const,
  currentDurability: null,
  maxDurability: null,
  quantity: 3,
  bonusStats: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  template: {
    id: 'tpl-1', name: 'Iron Ore', itemType: 'resource',
    weightClass: null, slot: null, tier: 1,
    baseStats: {}, requiredSkill: 'mining', requiredLevel: 1,
    maxDurability: 0, stackable: true, sellPrice: 5, flavorText: null,
  },
  equippedSlot: null,
};

describe('applyStateUpdates', () => {
  it('does nothing when updates is undefined', () => {
    const setters = makeSetters();
    applyStateUpdates(undefined, setters);
    expect(setters.setInventory).not.toHaveBeenCalled();
    expect(setters.setGold).not.toHaveBeenCalled();
  });

  it('adds inventory items', () => {
    const setters = makeSetters();
    applyStateUpdates({ inventoryAdded: [mockItem] }, setters);
    expect(setters.setInventory).toHaveBeenCalled();
  });

  it('removes inventory items by ID', () => {
    const setters = makeSetters();
    const existingItems = [mockItem, { ...mockItem, id: 'item-2' }];
    setters.setInventory = vi.fn((updater: any) => {
      const result = typeof updater === 'function' ? updater(existingItems) : updater;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('item-2');
      return result;
    });
    applyStateUpdates({ inventoryRemoved: ['item-1'] }, setters);
    expect(setters.setInventory).toHaveBeenCalled();
  });

  it('updates existing inventory items by ID', () => {
    const setters = makeSetters();
    const existingItems = [mockItem];
    const updated = { ...mockItem, quantity: 1 };
    setters.setInventory = vi.fn((updater: any) => {
      const result = typeof updater === 'function' ? updater(existingItems) : updater;
      expect(result[0].quantity).toBe(1);
      return result;
    });
    applyStateUpdates({ inventoryUpdated: [updated] }, setters);
    expect(setters.setInventory).toHaveBeenCalled();
  });

  it('applies combined add + remove + update in correct order', () => {
    const setters = makeSetters();
    const item2 = { ...mockItem, id: 'item-2', quantity: 5 };
    const existingItems = [mockItem, item2];
    const updatedItem2 = { ...item2, quantity: 2 };
    const newItem = { ...mockItem, id: 'item-3' };

    setters.setInventory = vi.fn((updater: any) => {
      const result = typeof updater === 'function' ? updater(existingItems) : updater;
      expect(result).toHaveLength(2);
      expect(result.find((i: any) => i.id === 'item-1')).toBeUndefined();
      expect(result.find((i: any) => i.id === 'item-2')?.quantity).toBe(2);
      expect(result.find((i: any) => i.id === 'item-3')).toBeDefined();
      return result;
    });

    applyStateUpdates({
      inventoryRemoved: ['item-1'],
      inventoryUpdated: [updatedItem2],
      inventoryAdded: [newItem],
    }, setters);
  });

  it('sets gold when provided', () => {
    const setters = makeSetters();
    applyStateUpdates({ gold: 500 }, setters);
    expect(setters.setGold).toHaveBeenCalledWith(500);
  });

  it('sets HP when provided', () => {
    const setters = makeSetters();
    const hp = { currentHp: 80, maxHp: 100, regenPerSecond: 1, lastHpRegenAt: '', isRecovering: false, recoveryCost: null };
    applyStateUpdates({ hp }, setters);
    expect(setters.setHpState).toHaveBeenCalledWith(hp);
  });

  it('passes resource partials to setters for merge', () => {
    const setters = makeSetters();
    const resources = {
      stamina: { current: 50, max: 100, regenPerSecond: 1, lastRegenAt: '' },
      mana: { current: 30, max: 80, regenPerSecond: 0.5, lastRegenAt: '' },
    };
    applyStateUpdates({ resources }, setters);
    expect(setters.setStaminaState).toHaveBeenCalledWith(resources.stamina);
    expect(setters.setManaState).toHaveBeenCalledWith(resources.mana);
  });

  it('sets buffs with PlayerBuffData shape', () => {
    const setters = makeSetters();
    const buffs = [{
      id: 'buff-1',
      buffType: 'combat_damage',
      remainingUses: 3,
      bonusValue: 0.1,
      shopItemName: 'Strength Potion',
      createdAt: '2026-03-17T00:00:00.000Z',
    }];
    applyStateUpdates({ buffs }, setters);
    expect(setters.setActiveBuffs).toHaveBeenCalledWith(buffs);
    // Verify the shape has the fields the frontend needs
    const passedBuffs = (setters.setActiveBuffs as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(passedBuffs[0]).toHaveProperty('remainingUses', 3);
    expect(passedBuffs[0]).toHaveProperty('bonusValue', 0.1);
    expect(passedBuffs[0]).toHaveProperty('shopItemName', 'Strength Potion');
  });

  it('sets materialTotals when provided', () => {
    const setters = makeSetters();
    applyStateUpdates({ materialTotals: { 'tpl-ore': 50 } }, setters);
    expect(setters.setMaterialTotals).toHaveBeenCalledWith({ 'tpl-ore': 50 });
  });

  it('sets skills when provided', () => {
    const setters = makeSetters();
    const skills = [{ id: 's1', skillType: 'mining', level: 5, xp: 1000, dailyXpGained: 200 }];
    applyStateUpdates({ skills }, setters);
    expect(setters.setSkills).toHaveBeenCalledWith(skills);
  });

  it('sets characterProgression when provided', () => {
    const setters = makeSetters();
    const cp = { characterXp: 5000, characterLevel: 10, attributePoints: 3 };
    applyStateUpdates({ characterProgression: cp }, setters);
    expect(setters.setCharacterProgression).toHaveBeenCalledWith(cp);
  });
});
