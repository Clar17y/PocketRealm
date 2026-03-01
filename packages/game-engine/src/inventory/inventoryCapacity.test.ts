import { describe, it, expect } from 'vitest';
import { getInventoryCapacity, getBackpackSlots } from './inventoryCapacity';

describe('getBackpackSlots', () => {
  it('returns 0 for no backpack', () => {
    expect(getBackpackSlots(0, 'common')).toBe(0);
  });

  it('returns tier * 8 for common backpack', () => {
    expect(getBackpackSlots(1, 'common')).toBe(8);
    expect(getBackpackSlots(3, 'common')).toBe(24);
    expect(getBackpackSlots(5, 'common')).toBe(40);
  });

  it('adds +2 per rarity above common', () => {
    expect(getBackpackSlots(1, 'uncommon')).toBe(10);
    expect(getBackpackSlots(1, 'rare')).toBe(12);
    expect(getBackpackSlots(1, 'epic')).toBe(14);
    expect(getBackpackSlots(1, 'legendary')).toBe(16);
  });

  it('T5 legendary = 48', () => {
    expect(getBackpackSlots(5, 'legendary')).toBe(48);
  });
});

describe('getInventoryCapacity', () => {
  it('returns base capacity with no bonuses', () => {
    expect(getInventoryCapacity({ backpackTier: 0, backpackRarity: 'common', beltSlotBonus: 0, isChampion: false })).toBe(24);
  });

  it('adds backpack slots', () => {
    expect(getInventoryCapacity({ backpackTier: 3, backpackRarity: 'common', beltSlotBonus: 0, isChampion: false })).toBe(48);
  });

  it('adds belt bonus', () => {
    expect(getInventoryCapacity({ backpackTier: 0, backpackRarity: 'common', beltSlotBonus: 6, isChampion: false })).toBe(30);
  });

  it('adds champion bonus', () => {
    expect(getInventoryCapacity({ backpackTier: 0, backpackRarity: 'common', beltSlotBonus: 0, isChampion: true })).toBe(32);
  });

  it('returns max capacity with all bonuses', () => {
    expect(getInventoryCapacity({ backpackTier: 5, backpackRarity: 'legendary', beltSlotBonus: 8, isChampion: true })).toBe(88);
  });
});
