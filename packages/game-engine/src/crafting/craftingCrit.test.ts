import { describe, expect, it } from 'vitest';
import {
  calculateCraftingCrit,
  calculateCritChance,
  calculateRareCraftChance,
  calculateEpicCraftChance,
  getEligibleBonusStats,
  rollBonusStat,
} from './craftingCrit';

describe('calculateCritChance', () => {
  it('returns base crit chance at exact recipe level', () => {
    expect(calculateCritChance(10, 10, 0)).toBeCloseTo(0.05);
  });

  it('scales with level advantage and luck', () => {
    expect(calculateCritChance(20, 10, 10)).toBeCloseTo(0.17);
  });

  it('clamps to min and max bounds', () => {
    expect(calculateCritChance(1, 50, 0)).toBeCloseTo(0.01);
    expect(calculateCritChance(100, 1, 500)).toBeCloseTo(0.5);
  });
});

describe('calculateRareCraftChance', () => {
  it('returns base rare chance at exact recipe level', () => {
    expect(calculateRareCraftChance(10, 10, 0)).toBeCloseTo(0.005);
  });

  it('scales with level advantage and luck', () => {
    // 0.005 + 10*0.001 + 15*0.0005 = 0.0225
    expect(calculateRareCraftChance(20, 10, 15)).toBeCloseTo(0.0225);
  });

  it('clamps to max', () => {
    expect(calculateRareCraftChance(100, 1, 500)).toBeCloseTo(0.04);
  });

  it('floors at 0 when underlevel', () => {
    expect(calculateRareCraftChance(1, 50, 0)).toBe(0);
  });
});

describe('calculateEpicCraftChance', () => {
  it('returns base epic chance at exact recipe level', () => {
    expect(calculateEpicCraftChance(10, 10, 0)).toBeCloseTo(0.0005);
  });

  it('scales with level advantage and luck', () => {
    // 0.0005 + 10*0.0001 + 15*0.00005 = 0.00225
    expect(calculateEpicCraftChance(20, 10, 15)).toBeCloseTo(0.00225);
  });

  it('clamps to max', () => {
    expect(calculateEpicCraftChance(100, 1, 500)).toBeCloseTo(0.004);
  });

  it('floors at 0 when underlevel', () => {
    expect(calculateEpicCraftChance(1, 50, 0)).toBe(0);
  });
});

describe('getEligibleBonusStats', () => {
  it('returns template-aware weapon pool (primary lane + utility) without slot', () => {
    expect(getEligibleBonusStats('weapon', { attack: 8 })).toEqual([
      'attack',
      'dodge',
      'accuracy',
      'luck',
    ]);
    expect(getEligibleBonusStats('weapon', { rangedPower: 8 })).toEqual([
      'rangedPower',
      'dodge',
      'accuracy',
      'luck',
    ]);
    expect(getEligibleBonusStats('weapon', { magicPower: 8 })).toEqual([
      'magicPower',
      'dodge',
      'accuracy',
      'luck',
    ]);
    expect(getEligibleBonusStats('weapon')).toEqual([
      'attack',
      'magicPower',
      'rangedPower',
      'dodge',
      'accuracy',
      'luck',
    ]);
  });

  it('returns armor pool (defensive lane + utility) without slot', () => {
    expect(getEligibleBonusStats('armor')).toEqual([
      'armor',
      'health',
      'dodge',
      'accuracy',
      'luck',
    ]);
    expect(getEligibleBonusStats('armor', { armor: 5 })).toEqual([
      'armor',
      'dodge',
      'accuracy',
      'luck',
    ]);
  });

  it('returns empty pool for non-equipment types', () => {
    expect(getEligibleBonusStats('resource')).toEqual([]);
    expect(getEligibleBonusStats('consumable')).toEqual([]);
  });

  it('returns slot-aware pool for main_hand', () => {
    const pool = getEligibleBonusStats('weapon', { attack: 8 }, 'main_hand');
    expect(pool).toEqual([
      'attack', 'critChance', 'critDamage',
      'accuracy', 'luck',
    ]);
  });

  it('main_hand filters offensive stats by baseStats, keeps crit always', () => {
    const pool = getEligibleBonusStats('weapon', { magicPower: 5 }, 'main_hand');
    expect(pool).toEqual([
      'magicPower', 'critChance', 'critDamage',
      'accuracy', 'luck',
    ]);
  });

  it('main_hand with no offensive baseStats falls back to all offensive', () => {
    const pool = getEligibleBonusStats('weapon', {}, 'main_hand');
    expect(pool).toEqual([
      'attack', 'magicPower', 'rangedPower', 'critChance', 'critDamage',
      'accuracy', 'luck',
    ]);
  });

  it('returns slot-aware pool for gloves', () => {
    const pool = getEligibleBonusStats('armor', { armor: 5 }, 'gloves');
    expect(pool).toEqual([
      'critChance', 'accuracy', 'critDamage',
      'attack', 'luck',
    ]);
  });

  it('returns slot-aware pool for chest', () => {
    const pool = getEligibleBonusStats('armor', { armor: 10, health: 5 }, 'chest');
    expect(pool).toEqual(['armor', 'magicDefence', 'health', 'luck']);
  });

  it('returns slot-aware pool for ring', () => {
    const pool = getEligibleBonusStats('armor', {}, 'ring');
    expect(pool).toEqual(['luck', 'accuracy', 'critChance', 'critDamage', 'dodge']);
  });

  it('returns slot-aware pool for charm', () => {
    const pool = getEligibleBonusStats('armor', {}, 'charm');
    expect(pool).toEqual(['luck', 'accuracy', 'dodge', 'critChance', 'critDamage', 'health']);
  });

  it('returns slot-aware pool for off_hand', () => {
    const pool = getEligibleBonusStats('armor', {}, 'off_hand');
    expect(pool).toEqual(['armor', 'magicDefence', 'dodge', 'health', 'luck']);
  });
});

describe('rollBonusStat', () => {
  it('rolls stat from eligible pool and computes percentage bonus', () => {
    const result = rollBonusStat(
      ['attack', 'magicPower', 'rangedPower', 'dodge', 'luck'],
      { attack: 50, luck: 10 },
      { statRoll: 0.7, bonusPercentRoll: 0.5 }
    );

    expect(result).toEqual({ stat: 'dodge', value: 1 });
  });

  it('guarantees minimum bonus even for low or missing base stat', () => {
    const withZero = rollBonusStat(['attack'], { attack: 0 }, { statRoll: 0, bonusPercentRoll: 0 });
    const withMissing = rollBonusStat(['attack'], {}, { statRoll: 0, bonusPercentRoll: 0 });

    expect(withZero).toEqual({ stat: 'attack', value: 1 });
    expect(withMissing).toEqual({ stat: 'attack', value: 1 });
  });

  it('rolls critChance within fixed range (0.03-0.05)', () => {
    const low = rollBonusStat(['critChance'], {}, { statRoll: 0, bonusPercentRoll: 0 });
    expect(low).toEqual({ stat: 'critChance', value: 0.03 });

    const high = rollBonusStat(['critChance'], {}, { statRoll: 0, bonusPercentRoll: 0.999 });
    expect(high!.stat).toBe('critChance');
    expect(high!.value).toBeCloseTo(0.05, 2);
    expect(high!.value).toBeLessThanOrEqual(0.05);
  });

  it('rolls critDamage within fixed range (0.10-0.20)', () => {
    const low = rollBonusStat(['critDamage'], {}, { statRoll: 0, bonusPercentRoll: 0 });
    expect(low).toEqual({ stat: 'critDamage', value: 0.10 });

    const mid = rollBonusStat(['critDamage'], {}, { statRoll: 0, bonusPercentRoll: 0.5 });
    expect(mid!.stat).toBe('critDamage');
    expect(mid!.value).toBeCloseTo(0.15, 2);
  });
});

describe('calculateCraftingCrit', () => {
  it('returns non-crit for non-equipment item types', () => {
    const result = calculateCraftingCrit({
      skillLevel: 20,
      requiredLevel: 1,
      luckStat: 20,
      itemType: 'resource',
      baseStats: {},
    }, {
      critRoll: 0,
    });

    expect(result.isCrit).toBe(false);
    expect(result.critChance).toBeCloseTo(0.28);
    expect(result.bonusStat).toBeNull();
    expect(result.bonusValue).toBeNull();
  });

  it('applies champion multiplier to crit chance', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.08,
      statRoll: 0,
      bonusPercentRoll: 0.5,
    }, { championMultiplier: 2 });

    expect(result.critChance).toBeCloseTo(0.10);
    expect(result.isCrit).toBe(true);
    expect(result.rarity).toBe('uncommon');
  });

  it('returns deterministic crit result when rolls are provided', () => {
    const result = calculateCraftingCrit({
      skillLevel: 25,
      requiredLevel: 5,
      luckStat: 10,
      itemType: 'weapon',
      baseStats: { attack: 50, dodge: 20 },
    }, {
      critRoll: 0.01,
      statRoll: 0.9,
      bonusPercentRoll: 0.5,
    });

    expect(result.isCrit).toBe(true);
    expect(result.critChance).toBeCloseTo(0.27);
    expect(result.bonusStat).toBe('luck');
    expect(result.bonusValue).toBe(1);
  });

  it('uses slot-aware pool when slot provided', () => {
    const result = calculateCraftingCrit({
      skillLevel: 25,
      requiredLevel: 5,
      luckStat: 10,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.01,
      statRoll: 0, // first in pool = attack
      bonusPercentRoll: 0.5,
    });

    expect(result.isCrit).toBe(true);
    // main_hand pool with attack baseStats: [attack, critChance, critDamage, accuracy, luck]
    expect(result.bonusStat).toBe('attack');
    expect(result.bonusValue).toBeGreaterThan(0);
  });

  it('returns rare rarity when roll is between epic and rare thresholds', () => {
    // At skillLevel=10, requiredLevel=10, luck=0:
    // epicCraftChance = 0.0005, rareCraftChance = 0.005, critChance = 0.05
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.001,   // 0.0005 < 0.001 < 0.005 → rare
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    expect(result.isCrit).toBe(true);
    expect(result.rarity).toBe('rare');
  });

  it('returns epic rarity when roll is below epic threshold', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.0001,  // below epicCraftChance (0.0005)
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    expect(result.isCrit).toBe(true);
    expect(result.rarity).toBe('epic');
  });

  it('returns uncommon rarity for normal crit above rare threshold', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.01,    // above rareCraftChance (0.005), below critChance (0.05)
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    expect(result.isCrit).toBe(true);
    expect(result.rarity).toBe('uncommon');
  });

  it('returns common rarity when roll misses crit', () => {
    const result = calculateCraftingCrit({
      skillLevel: 10,
      requiredLevel: 10,
      luckStat: 0,
      itemType: 'weapon',
      baseStats: { attack: 50 },
      slot: 'main_hand',
    }, {
      critRoll: 0.9,
      statRoll: 0,
      bonusPercentRoll: 0.5,
    });
    expect(result.isCrit).toBe(false);
    expect(result.rarity).toBe('common');
  });

  it('returns common rarity for non-equipment even with low roll', () => {
    const result = calculateCraftingCrit({
      skillLevel: 20,
      requiredLevel: 1,
      luckStat: 20,
      itemType: 'resource',
      baseStats: {},
    }, {
      critRoll: 0,
    });
    expect(result.isCrit).toBe(false);
    expect(result.rarity).toBe('common');
  });
});
