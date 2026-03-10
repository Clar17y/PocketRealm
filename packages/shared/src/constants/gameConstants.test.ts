import { describe, expect, it } from 'vitest';
import {
  TURN_CONSTANTS,
  COMBAT_CONSTANTS,
  CRIT_STAT_CONSTANTS,
  SLOT_STAT_POOLS,
  SKILL_CONSTANTS,
  EXPLORATION_CONSTANTS,
  HP_CONSTANTS,
  FLEE_CONSTANTS,
  DURABILITY_CONSTANTS,
  GATHERING_CONSTANTS,
  CRAFTING_CONSTANTS,
  ITEM_RARITY_CONSTANTS,
  ZONE_CONSTANTS,
  POTION_CONSTANTS,
  CHEST_CONSTANTS,
  CHARACTER_CONSTANTS,
  CHAT_CONSTANTS,
  PVP_CONSTANTS,
  WORLD_EVENT_CONSTANTS,
  ZONE_EXPLORATION_CONSTANTS,
  TIER_BLEED_CONSTANTS,
  ROOM_CONSTANTS,
  FULL_CLEAR_CONSTANTS,
  LEADERBOARD_CONSTANTS,
  HIT_CURVE_CONSTANTS,
} from './gameConstants';

describe('TURN_CONSTANTS', () => {
  it('has expected critical values', () => {
    expect(TURN_CONSTANTS.REGEN_RATE).toBe(1);
    expect(TURN_CONSTANTS.BANK_CAP).toBe(64_800);
    expect(TURN_CONSTANTS.STARTING_TURNS).toBe(86_400);
  });

  it('bank cap is 18 hours at regen rate', () => {
    expect(TURN_CONSTANTS.BANK_CAP / TURN_CONSTANTS.REGEN_RATE).toBe(64_800);
  });
});

describe('COMBAT_CONSTANTS', () => {
  it('has valid hit chance range', () => {
    expect(COMBAT_CONSTANTS.BASE_HIT_CHANCE).toBeGreaterThan(0);
    expect(COMBAT_CONSTANTS.BASE_HIT_CHANCE).toBeLessThanOrEqual(1);
  });

  it('crit multiplier is greater than 1', () => {
    expect(COMBAT_CONSTANTS.CRIT_MULTIPLIER).toBeGreaterThan(1);
  });

  it('min damage is positive', () => {
    expect(COMBAT_CONSTANTS.MIN_DAMAGE).toBeGreaterThan(0);
  });
});

describe('HIT_CURVE_CONSTANTS', () => {
  it('defines valid hit curve bounds for every combat mode', () => {
    for (const config of Object.values(HIT_CURVE_CONSTANTS)) {
      expect(config.minHitChance).toBeGreaterThanOrEqual(0);
      expect(config.minHitChance).toBeLessThanOrEqual(1);
      expect(config.maxHitChance).toBeGreaterThanOrEqual(0);
      expect(config.maxHitChance).toBeLessThanOrEqual(1);
      expect(config.minHitChance).toBeLessThan(config.maxHitChance);
      expect(config.bias).toBeGreaterThan(0);
      expect(config.exponent).toBeGreaterThan(0);
    }
  });
});

describe('SKILL_CONSTANTS', () => {
  it('XP curve produces increasing values', () => {
    const xpAtLevel5 = SKILL_CONSTANTS.XP_BASE * Math.pow(5, SKILL_CONSTANTS.XP_EXPONENT);
    const xpAtLevel10 = SKILL_CONSTANTS.XP_BASE * Math.pow(10, SKILL_CONSTANTS.XP_EXPONENT);
    expect(xpAtLevel10).toBeGreaterThan(xpAtLevel5);
  });

  it('max level is reasonable', () => {
    expect(SKILL_CONSTANTS.MAX_LEVEL).toBe(100);
  });

  it('daily caps are positive', () => {
    expect(SKILL_CONSTANTS.DAILY_CAP_COMBAT).toBeGreaterThan(0);
    expect(SKILL_CONSTANTS.DAILY_CAP_GATHERING).toBeGreaterThan(0);
    expect(SKILL_CONSTANTS.DAILY_CAP_PROCESSING).toBeGreaterThan(0);
    expect(SKILL_CONSTANTS.DAILY_CAP_CRAFTING).toBeGreaterThan(0);
  });
});

describe('EXPLORATION_CONSTANTS', () => {
  it('per-turn chances are in (0, 1)', () => {
    expect(EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN).toBeGreaterThan(0);
    expect(EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN).toBeLessThan(1);
    expect(EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN).toBeGreaterThan(0);
    expect(EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN).toBeLessThan(1);
  });

  it('min < max exploration turns', () => {
    expect(EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS)
      .toBeLessThan(EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS);
  });
});

describe('HP_CONSTANTS', () => {
  it('has expected base HP', () => {
    expect(HP_CONSTANTS.BASE_HP).toBe(100);
  });

  it('recovery exit HP is less than 100%', () => {
    expect(HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT).toBeGreaterThan(0);
    expect(HP_CONSTANTS.RECOVERY_EXIT_HP_PERCENT).toBeLessThan(1);
  });
});

describe('FLEE_CONSTANTS', () => {
  it('min flee < base flee < max flee', () => {
    expect(FLEE_CONSTANTS.MIN_FLEE_CHANCE).toBeLessThan(FLEE_CONSTANTS.BASE_FLEE_CHANCE);
    expect(FLEE_CONSTANTS.BASE_FLEE_CHANCE).toBeLessThan(FLEE_CONSTANTS.MAX_FLEE_CHANCE);
  });

  it('gold loss increases with severity', () => {
    expect(FLEE_CONSTANTS.GOLD_LOSS_MINOR).toBeLessThan(FLEE_CONSTANTS.GOLD_LOSS_MODERATE);
    expect(FLEE_CONSTANTS.GOLD_LOSS_MODERATE).toBeLessThan(FLEE_CONSTANTS.GOLD_LOSS_SEVERE);
  });
});

describe('ITEM_RARITY_CONSTANTS', () => {
  it('has 5 rarity tiers in order', () => {
    expect(ITEM_RARITY_CONSTANTS.ORDER).toEqual([
      'common', 'uncommon', 'rare', 'epic', 'legendary',
    ]);
  });

  it('drop weights are positive', () => {
    const weights = ITEM_RARITY_CONSTANTS.DROP_WEIGHT_BY_RARITY;
    for (const rarity of ITEM_RARITY_CONSTANTS.ORDER) {
      expect(weights[rarity as keyof typeof weights]).toBeGreaterThan(0);
    }
  });

  it('drop weights sum to > 0', () => {
    const weights = ITEM_RARITY_CONSTANTS.DROP_WEIGHT_BY_RARITY;
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThan(0);
  });

  it('bonus slots increase with rarity', () => {
    const slots = ITEM_RARITY_CONSTANTS.BONUS_SLOTS_BY_RARITY;
    expect(slots.common).toBeLessThan(slots.uncommon);
    expect(slots.uncommon).toBeLessThan(slots.rare);
    expect(slots.rare).toBeLessThan(slots.epic);
    expect(slots.epic).toBeLessThan(slots.legendary);
  });
});

describe('DURABILITY_CONSTANTS', () => {
  it('warning threshold is between 0 and 1', () => {
    expect(DURABILITY_CONSTANTS.WARNING_THRESHOLD).toBeGreaterThan(0);
    expect(DURABILITY_CONSTANTS.WARNING_THRESHOLD).toBeLessThan(1);
  });
});

describe('CRAFTING_CONSTANTS', () => {
  it('crit chance bounds are valid', () => {
    expect(CRAFTING_CONSTANTS.MIN_CRIT_CHANCE).toBeLessThan(CRAFTING_CONSTANTS.MAX_CRIT_CHANCE);
    expect(CRAFTING_CONSTANTS.MIN_CRIT_CHANCE).toBeGreaterThan(0);
    expect(CRAFTING_CONSTANTS.MAX_CRIT_CHANCE).toBeLessThanOrEqual(1);
  });
});

describe('POTION_CONSTANTS', () => {
  it('heal amounts increase with tier', () => {
    expect(POTION_CONSTANTS.MINOR_HEALTH_HEAL)
      .toBeLessThan(POTION_CONSTANTS.HEALTH_HEAL);
    expect(POTION_CONSTANTS.HEALTH_HEAL)
      .toBeLessThan(POTION_CONSTANTS.GREATER_HEALTH_HEAL);
  });

  it('recovery percents increase with tier', () => {
    expect(POTION_CONSTANTS.MINOR_RECOVERY_PERCENT)
      .toBeLessThan(POTION_CONSTANTS.RECOVERY_PERCENT);
    expect(POTION_CONSTANTS.RECOVERY_PERCENT)
      .toBeLessThan(POTION_CONSTANTS.GREATER_RECOVERY_PERCENT);
  });
});

describe('CHEST_CONSTANTS', () => {
  it('recipe chance increases with size', () => {
    expect(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_SMALL)
      .toBeLessThanOrEqual(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_MEDIUM);
    expect(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_MEDIUM)
      .toBeLessThan(CHEST_CONSTANTS.CHEST_RECIPE_CHANCE_LARGE);
  });
});

describe('ZONE_CONSTANTS', () => {
  it('has positive travel cost', () => {
    expect(ZONE_CONSTANTS.BASE_TRAVEL_COST).toBeGreaterThan(0);
  });

  it('difficult terrain multiplier > 1', () => {
    expect(ZONE_CONSTANTS.DIFFICULT_TERRAIN_MULTIPLIER).toBeGreaterThan(1);
  });
});

describe('CHARACTER_CONSTANTS', () => {
  it('XP ratio is between 0 and 1', () => {
    expect(CHARACTER_CONSTANTS.XP_RATIO).toBeGreaterThan(0);
    expect(CHARACTER_CONSTANTS.XP_RATIO).toBeLessThanOrEqual(1);
  });
});

describe('CRIT_STAT_CONSTANTS', () => {
  it('critChance range is valid', () => {
    const { min, max } = CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS.critChance;
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('critDamage range is valid', () => {
    const { min, max } = CRIT_STAT_CONSTANTS.FIXED_RANGE_BONUS_STATS.critDamage;
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThan(min);
  });
});

describe('SLOT_STAT_POOLS', () => {
  const EXPECTED_SLOTS = [
    'main_hand', 'off_hand', 'head', 'chest', 'legs',
    'boots', 'gloves', 'neck', 'belt', 'ring', 'charm',
  ];

  it('has all 11 equipment slots', () => {
    for (const slot of EXPECTED_SLOTS) {
      expect(SLOT_STAT_POOLS[slot]).toBeDefined();
    }
  });

  it('every slot has primary and utility arrays', () => {
    for (const slot of EXPECTED_SLOTS) {
      const pool = SLOT_STAT_POOLS[slot];
      expect(Array.isArray(pool.primary)).toBe(true);
      expect(Array.isArray(pool.utility)).toBe(true);
      expect(pool.primary.length).toBeGreaterThan(0);
    }
  });

  it('main_hand has offensive stats', () => {
    expect(SLOT_STAT_POOLS.main_hand.primary).toContain('attack');
  });

  it('off_hand has defensive stats', () => {
    expect(SLOT_STAT_POOLS.off_hand.primary).toContain('armor');
  });
});

describe('CHAT_CONSTANTS', () => {
  it('has positive message length limit', () => {
    expect(CHAT_CONSTANTS.MAX_MESSAGE_LENGTH).toBeGreaterThan(0);
  });

  it('has positive rate limits', () => {
    expect(CHAT_CONSTANTS.WORLD_RATE_LIMIT_MS).toBeGreaterThan(0);
    expect(CHAT_CONSTANTS.ZONE_RATE_LIMIT_MS).toBeGreaterThan(0);
  });
});

describe('PVP_CONSTANTS', () => {
  it('has positive starting rating', () => {
    expect(PVP_CONSTANTS.STARTING_RATING).toBeGreaterThan(0);
  });

  it('bracket range is between 0 and 1', () => {
    expect(PVP_CONSTANTS.BRACKET_RANGE).toBeGreaterThan(0);
    expect(PVP_CONSTANTS.BRACKET_RANGE).toBeLessThan(1);
  });

  it('turn costs are positive', () => {
    expect(PVP_CONSTANTS.CHALLENGE_TURN_COST).toBeGreaterThan(0);
    expect(PVP_CONSTANTS.SCOUT_TURN_COST).toBeGreaterThan(0);
    expect(PVP_CONSTANTS.REVENGE_TURN_COST).toBeGreaterThan(0);
  });

  it('revenge is cheaper than challenge', () => {
    expect(PVP_CONSTANTS.REVENGE_TURN_COST).toBeLessThan(PVP_CONSTANTS.CHALLENGE_TURN_COST);
  });
});

describe('WORLD_EVENT_CONSTANTS', () => {
  it('event durations are positive', () => {
    expect(WORLD_EVENT_CONSTANTS.RESOURCE_EVENT_DURATION_HOURS).toBeGreaterThan(0);
    expect(WORLD_EVENT_CONSTANTS.MOB_EVENT_DURATION_HOURS).toBeGreaterThan(0);
    expect(WORLD_EVENT_CONSTANTS.WORLD_WIDE_EVENT_DURATION_HOURS).toBeGreaterThan(0);
  });

  it('boss tier arrays have 5 entries', () => {
    expect(WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER).toHaveLength(5);
    expect(WORLD_EVENT_CONSTANTS.BOSS_AOE_PER_PLAYER_BY_TIER).toHaveLength(5);
    expect(WORLD_EVENT_CONSTANTS.BOSS_DEFENCE_BY_TIER).toHaveLength(5);
    expect(WORLD_EVENT_CONSTANTS.BOSS_BASE_XP_REWARD_BY_TIER).toHaveLength(5);
  });

  it('boss tier arrays increase monotonically', () => {
    for (let i = 1; i < 5; i++) {
      expect(WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER[i]).toBeGreaterThan(
        WORLD_EVENT_CONSTANTS.BOSS_HP_PER_PLAYER_BY_TIER[i - 1],
      );
    }
  });
});

describe('ZONE_EXPLORATION_CONSTANTS', () => {
  it('default tiers have expected structure', () => {
    const tiers = ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;
    expect(tiers['1']).toBe(0);
    expect(Number(tiers['2'])).toBeGreaterThan(0);
  });

  it('newest tier weight multiplier is > 1', () => {
    expect(ZONE_EXPLORATION_CONSTANTS.NEWEST_TIER_WEIGHT_MULTIPLIER).toBeGreaterThan(1);
  });
});

describe('TIER_BLEED_CONSTANTS', () => {
  it('weights sum to 1', () => {
    const sum =
      TIER_BLEED_CONSTANTS.TWO_BELOW +
      TIER_BLEED_CONSTANTS.ONE_BELOW +
      TIER_BLEED_CONSTANTS.SELECTED +
      TIER_BLEED_CONSTANTS.ONE_ABOVE +
      TIER_BLEED_CONSTANTS.TWO_ABOVE;
    expect(sum).toBeCloseTo(1, 5);
  });

  it('current tier has highest weight', () => {
    expect(TIER_BLEED_CONSTANTS.SELECTED).toBeGreaterThan(
      TIER_BLEED_CONSTANTS.ONE_ABOVE,
    );
    expect(TIER_BLEED_CONSTANTS.ONE_ABOVE).toBeGreaterThan(
      TIER_BLEED_CONSTANTS.TWO_ABOVE,
    );
  });
});

describe('ROOM_CONSTANTS', () => {
  it('room counts increase with size', () => {
    expect(ROOM_CONSTANTS.ROOMS_SMALL.max).toBeLessThanOrEqual(ROOM_CONSTANTS.ROOMS_MEDIUM.min);
    expect(ROOM_CONSTANTS.ROOMS_MEDIUM.max).toBeLessThanOrEqual(ROOM_CONSTANTS.ROOMS_LARGE.max);
  });

  it('min <= max for all room sizes', () => {
    expect(ROOM_CONSTANTS.ROOMS_SMALL.min).toBeLessThanOrEqual(ROOM_CONSTANTS.ROOMS_SMALL.max);
    expect(ROOM_CONSTANTS.ROOMS_MEDIUM.min).toBeLessThanOrEqual(ROOM_CONSTANTS.ROOMS_MEDIUM.max);
    expect(ROOM_CONSTANTS.ROOMS_LARGE.min).toBeLessThanOrEqual(ROOM_CONSTANTS.ROOMS_LARGE.max);
  });
});

describe('FULL_CLEAR_CONSTANTS', () => {
  it('drop multiplier is > 1', () => {
    expect(FULL_CLEAR_CONSTANTS.DROP_MULTIPLIER).toBeGreaterThan(1);
  });

  it('recipe multiplier is > 1', () => {
    expect(FULL_CLEAR_CONSTANTS.RECIPE_MULTIPLIER).toBeGreaterThan(1);
  });
});

describe('LEADERBOARD_CONSTANTS', () => {
  it('refresh interval is positive', () => {
    expect(LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS).toBeGreaterThan(0);
  });

  it('page size is positive', () => {
    expect(LEADERBOARD_CONSTANTS.PAGE_SIZE).toBeGreaterThan(0);
  });
});
