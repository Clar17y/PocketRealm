import { describe, it, expect } from 'vitest';
import { calculateSellPrice } from './sellPrice';

describe('calculateSellPrice', () => {
  it('returns 0 for null sellPrice', () => {
    expect(calculateSellPrice({ baseSellPrice: null, rarity: 'common', currentDurability: null, maxDurability: null })).toBe(0);
  });

  it('returns 0 for zero sellPrice', () => {
    expect(calculateSellPrice({ baseSellPrice: 0, rarity: 'common', currentDurability: null, maxDurability: null })).toBe(0);
  });

  it('returns base price for common items', () => {
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'common', currentDurability: null, maxDurability: null })).toBe(10);
  });

  it('applies rarity multiplier', () => {
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'uncommon', currentDurability: null, maxDurability: null })).toBe(20);
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'rare', currentDurability: null, maxDurability: null })).toBe(40);
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'epic', currentDurability: null, maxDurability: null })).toBe(80);
    expect(calculateSellPrice({ baseSellPrice: 10, rarity: 'legendary', currentDurability: null, maxDurability: null })).toBe(160);
  });

  it('no penalty above 50% durability', () => {
    expect(calculateSellPrice({ baseSellPrice: 100, rarity: 'common', currentDurability: 80, maxDurability: 100 })).toBe(100);
  });

  it('applies durability penalty below 50%', () => {
    expect(calculateSellPrice({ baseSellPrice: 100, rarity: 'common', currentDurability: 30, maxDurability: 100 })).toBe(30);
  });

  it('minimum sell price is 1 for sellable items', () => {
    expect(calculateSellPrice({ baseSellPrice: 1, rarity: 'common', currentDurability: 1, maxDurability: 100 })).toBe(1);
  });
});
