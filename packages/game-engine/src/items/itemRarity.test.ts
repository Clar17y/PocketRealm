import { describe, expect, it } from 'vitest';
import {
  calculateCraftingTurnDiscount,
  calculateDropRarityWeights,
  calculateForgeUpgradeSuccessChance,
  getBonusSlotCount,
  getForgeRerollCost,
  getForgeUpgradeCost,
  getNextRarity,
  rarityFromBonusSlotCount,
  rollBonusStatsForRarity,
  rollDropRarity,
  rollForgeUpgradeSuccess,
} from './itemRarity';

describe('itemRarity', () => {
  it('maps rarity to slot counts and back', () => {
    expect(getBonusSlotCount('common')).toBe(0);
    expect(getBonusSlotCount('legendary')).toBe(4);

    expect(rarityFromBonusSlotCount(0)).toBe('common');
    expect(rarityFromBonusSlotCount(1)).toBe('uncommon');
    expect(rarityFromBonusSlotCount(4)).toBe('legendary');
    expect(rarityFromBonusSlotCount(99)).toBe('legendary');
  });

  it('computes rarity progression', () => {
    expect(getNextRarity('common')).toBe('uncommon');
    expect(getNextRarity('uncommon')).toBe('rare');
    expect(getNextRarity('rare')).toBe('epic');
    expect(getNextRarity('epic')).toBe('legendary');
    expect(getNextRarity('legendary')).toBeNull();
  });

  it('returns forge costs by rarity', () => {
    expect(getForgeUpgradeCost('common')).toBe(100);
    expect(getForgeUpgradeCost('legendary')).toBeNull();
    expect(getForgeRerollCost('common')).toBeNull();
    expect(getForgeRerollCost('legendary')).toBe(600);
  });

  it('applies forge luck bonus with cap', () => {
    expect(calculateForgeUpgradeSuccessChance('common', 0)).toBeCloseTo(0.6);
    expect(calculateForgeUpgradeSuccessChance('common', 50)).toBeCloseTo(0.65);
    expect(calculateForgeUpgradeSuccessChance('common', 500)).toBeCloseTo(0.7);
    expect(calculateForgeUpgradeSuccessChance('legendary', 999)).toBeNull();
  });

  it('rolls forge upgrades deterministically', () => {
    expect(rollForgeUpgradeSuccess('common', 0, 0.59)).toBe(true);
    expect(rollForgeUpgradeSuccess('common', 0, 0.6)).toBe(false);
  });

  it('computes drop weights with mob level and prefix multiplier', () => {
    const level1 = calculateDropRarityWeights(1, 1);
    expect(level1.common).toBeCloseTo(650);
    expect(level1.uncommon).toBeCloseTo(250);
    expect(level1.rare).toBeCloseTo(80);
    expect(level1.epic).toBeCloseTo(18);
    expect(level1.legendary).toBeCloseTo(2);

    const level11Ancient = calculateDropRarityWeights(11, 2);
    expect(level11Ancient.common).toBeCloseTo(630);
    expect(level11Ancient.uncommon).toBeCloseTo(520);
    expect(level11Ancient.rare).toBeCloseTo(172);
    expect(level11Ancient.epic).toBeCloseTo(42);
    expect(level11Ancient.legendary).toBeCloseTo(6);
  });

  it('rolls drop rarity from weighted totals deterministically', () => {
    expect(rollDropRarity(1, 1, 0)).toBe('common');
    expect(rollDropRarity(1, 1, 0.8)).toBe('uncommon');
    expect(rollDropRarity(1, 1, 0.95)).toBe('rare');
    expect(rollDropRarity(1, 1, 0.99)).toBe('epic');
    expect(rollDropRarity(1, 1, 0.999)).toBe('legendary');
  });

  it('allows duplicate stat rolls and stacks their values', () => {
    const rolled = rollBonusStatsForRarity({
      itemType: 'weapon',
      rarity: 'epic',
      baseStats: { attack: 20 },
      statRolls: [0, 0, 0],
      bonusPercentRolls: [0, 0.5, 0.999],
    });

    expect(rolled).not.toBeNull();
    const entries = Object.entries(rolled ?? {});
    expect(entries.length).toBe(1);
    expect(entries[0]?.[0]).toBe('attack');
    expect((rolled?.attack ?? 0)).toBeGreaterThan(0);
  });

  it('uses template-aware weapon pool (primary lane + utility)', () => {
    const rolled = rollBonusStatsForRarity({
      itemType: 'weapon',
      rarity: 'legendary',
      baseStats: { rangedPower: 10 },
      statRolls: [0.999, 0.5, 0.25, 0],
      bonusPercentRolls: [0.1, 0.2, 0.3, 0.4],
    });

    expect(rolled).not.toBeNull();
    const entries = Object.entries(rolled ?? {});
    expect(entries.length).toBeGreaterThan(0);
    const allowed = new Set(['rangedPower', 'dodge', 'accuracy', 'luck']);
    for (const [key, value] of entries) {
      expect(allowed.has(key)).toBe(true);
      expect(typeof value).toBe('number');
      expect(value).toBeGreaterThanOrEqual(1);
    }
    expect(rolled?.attack ?? 0).toBe(0);
    expect(rolled?.magicPower ?? 0).toBe(0);
  });

  it('returns null bonus stats for non-equipment rarities or no slots', () => {
    expect(
      rollBonusStatsForRarity({
        itemType: 'resource',
        rarity: 'legendary',
        baseStats: null,
      })
    ).toBeNull();

    expect(
      rollBonusStatsForRarity({
        itemType: 'weapon',
        rarity: 'common',
        baseStats: { attack: 100 },
      })
    ).toBeNull();
  });

  it('uses slot-aware pool when slot is provided', () => {
    const rolled = rollBonusStatsForRarity({
      itemType: 'weapon',
      rarity: 'legendary',
      baseStats: { attack: 20 },
      slot: 'main_hand',
      statRolls: [0, 0, 0, 0],
      bonusPercentRolls: [0.5, 0.5, 0.5, 0.5],
    });

    expect(rolled).not.toBeNull();
    // First stat in main_hand pool with attack baseStats is 'attack'
    expect(rolled!.attack).toBeGreaterThan(0);
  });

  it('main_hand can roll critChance and critDamage', () => {
    // Pool: [attack, critChance, critDamage, accuracy, luck] (5 stats)
    // statRoll 0.2 => index 1 = critChance
    const rolled = rollBonusStatsForRarity({
      itemType: 'weapon',
      rarity: 'uncommon',
      baseStats: { attack: 20 },
      slot: 'main_hand',
      statRolls: [0.2],
      bonusPercentRolls: [0.5],
    });

    expect(rolled).not.toBeNull();
    expect(rolled!.critChance).toBeGreaterThanOrEqual(0.03);
    expect(rolled!.critChance).toBeLessThanOrEqual(0.05);
  });

  it('gloves can roll critChance', () => {
    // Pool: [critChance, accuracy, critDamage, attack, luck] (5 stats)
    // statRoll 0 => index 0 = critChance
    const rolled = rollBonusStatsForRarity({
      itemType: 'armor',
      rarity: 'uncommon',
      baseStats: { armor: 5 },
      slot: 'gloves',
      statRolls: [0],
      bonusPercentRolls: [0.5],
    });

    expect(rolled).not.toBeNull();
    expect(rolled!.critChance).toBeGreaterThanOrEqual(0.03);
    expect(rolled!.critChance).toBeLessThanOrEqual(0.05);
  });

  it('ring can roll critDamage', () => {
    // Pool: [luck, accuracy, critChance, critDamage, dodge] (5 stats)
    // statRoll 0.7 => index 3 = critDamage
    const rolled = rollBonusStatsForRarity({
      itemType: 'armor',
      rarity: 'uncommon',
      baseStats: {},
      slot: 'ring',
      statRolls: [0.7],
      bonusPercentRolls: [0.5],
    });

    expect(rolled).not.toBeNull();
    expect(rolled!.critDamage).toBeGreaterThanOrEqual(0.10);
    expect(rolled!.critDamage).toBeLessThanOrEqual(0.20);
  });

  it('charm can roll critChance', () => {
    // Pool: [luck, accuracy, dodge, critChance, critDamage, health] (6 stats)
    // statRoll 0.66 => index 3 = critChance
    const rolled = rollBonusStatsForRarity({
      itemType: 'armor',
      rarity: 'uncommon',
      baseStats: {},
      slot: 'charm',
      statRolls: [0.66],
      bonusPercentRolls: [0.5],
    });

    expect(rolled).not.toBeNull();
    expect(rolled!.critChance).toBeGreaterThanOrEqual(0.03);
    expect(rolled!.critChance).toBeLessThanOrEqual(0.05);
  });

  it('chest cannot roll critChance or critDamage', () => {
    // Pool: [armor, health, luck] - no crit stats
    const rolled = rollBonusStatsForRarity({
      itemType: 'armor',
      rarity: 'legendary',
      baseStats: { armor: 10, health: 5 },
      slot: 'chest',
      statRolls: [0, 0.33, 0.66, 0.99],
      bonusPercentRolls: [0.5, 0.5, 0.5, 0.5],
    });

    expect(rolled).not.toBeNull();
    expect(rolled!.critChance).toBeUndefined();
    expect(rolled!.critDamage).toBeUndefined();
  });

  it('calculates crafting turn discount based on skill level above recipe', () => {
    // Same level = full price
    expect(calculateCraftingTurnDiscount(100, 5, 5)).toBe(100);
    // 1 level above = 80%
    expect(calculateCraftingTurnDiscount(100, 6, 5)).toBe(80);
    // 2 levels above = 60%
    expect(calculateCraftingTurnDiscount(100, 7, 5)).toBe(60);
    // 3 levels above = 40%
    expect(calculateCraftingTurnDiscount(100, 8, 5)).toBe(40);
    // 4 levels above = 20%
    expect(calculateCraftingTurnDiscount(100, 9, 5)).toBe(20);
    // 5+ levels above = free
    expect(calculateCraftingTurnDiscount(100, 10, 5)).toBe(0);
    expect(calculateCraftingTurnDiscount(100, 99, 5)).toBe(0);
  });

  it('floors fractional discount results', () => {
    expect(calculateCraftingTurnDiscount(250, 6, 5)).toBe(200);
    expect(calculateCraftingTurnDiscount(50, 6, 5)).toBe(40);
    expect(calculateCraftingTurnDiscount(50, 7, 5)).toBe(30);
    expect(calculateCraftingTurnDiscount(75, 7, 5)).toBe(45);
  });

  it('returns full price when skill level is below recipe level', () => {
    expect(calculateCraftingTurnDiscount(100, 3, 5)).toBe(100);
    expect(calculateCraftingTurnDiscount(100, 1, 10)).toBe(100);
  });

  it('returns 0 for 0 base cost', () => {
    expect(calculateCraftingTurnDiscount(0, 99, 1)).toBe(0);
  });
});
