import { describe, it, expect } from 'vitest';
import {
  bossActiveEffectSchema,
  bossRoundSummarySchema,
  bossPlayerRewardSchema,
  parseBossEffects,
  parseBossRoundSummaries,
  parseBossRewardsByPlayer,
} from './bossJsonSchemas';

// ---------------------------------------------------------------------------
// BossActiveEffect schema
// ---------------------------------------------------------------------------

describe('bossActiveEffectSchema', () => {
  it('accepts a valid BossActiveEffect', () => {
    const valid = {
      name: 'Weaken',
      stat: 'defence',
      modifier: -5,
      roundsRemaining: 3,
    };
    expect(bossActiveEffectSchema.parse(valid)).toEqual(valid);
  });

  it('accepts optional damagePerRound and dotDamageType', () => {
    const valid = {
      name: 'Poison',
      stat: 'hp',
      modifier: 0,
      roundsRemaining: 2,
      damagePerRound: 10,
      dotDamageType: 'magic' as const,
    };
    expect(bossActiveEffectSchema.parse(valid)).toEqual(valid);
  });

  it('accepts dotDamageType physical', () => {
    const valid = {
      name: 'Bleed',
      stat: 'hp',
      modifier: 0,
      roundsRemaining: 1,
      damagePerRound: 5,
      dotDamageType: 'physical' as const,
    };
    expect(bossActiveEffectSchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing name', () => {
    const invalid = { stat: 'defence', modifier: -5, roundsRemaining: 3 };
    expect(() => bossActiveEffectSchema.parse(invalid)).toThrow();
  });

  it('rejects missing stat', () => {
    const invalid = { name: 'Weaken', modifier: -5, roundsRemaining: 3 };
    expect(() => bossActiveEffectSchema.parse(invalid)).toThrow();
  });

  it('rejects non-number modifier', () => {
    const invalid = { name: 'Weaken', stat: 'defence', modifier: 'five', roundsRemaining: 3 };
    expect(() => bossActiveEffectSchema.parse(invalid)).toThrow();
  });

  it('rejects invalid dotDamageType', () => {
    const invalid = {
      name: 'Poison',
      stat: 'hp',
      modifier: 0,
      roundsRemaining: 2,
      damagePerRound: 10,
      dotDamageType: 'fire',
    };
    expect(() => bossActiveEffectSchema.parse(invalid)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// BossRoundSummary schema
// ---------------------------------------------------------------------------

describe('bossRoundSummarySchema', () => {
  it('accepts a valid BossRoundSummary', () => {
    const valid = {
      round: 1,
      bossDamage: 50,
      totalPlayerDamage: 200,
      bossHpPercent: 80,
      playersAlive: 3,
      playersDead: 1,
    };
    expect(bossRoundSummarySchema.parse(valid)).toEqual(valid);
  });

  it('rejects missing round', () => {
    const invalid = { bossDamage: 50, totalPlayerDamage: 200, bossHpPercent: 80, playersAlive: 3, playersDead: 1 };
    expect(() => bossRoundSummarySchema.parse(invalid)).toThrow();
  });

  it('rejects non-number bossDamage', () => {
    const invalid = { round: 1, bossDamage: 'lots', totalPlayerDamage: 200, bossHpPercent: 80, playersAlive: 3, playersDead: 1 };
    expect(() => bossRoundSummarySchema.parse(invalid)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// BossPlayerReward schema
// ---------------------------------------------------------------------------

describe('bossPlayerRewardSchema', () => {
  it('accepts a minimal reward (loot only)', () => {
    const valid = {
      loot: [{ itemTemplateId: 'item-1', quantity: 2 }],
    };
    const parsed = bossPlayerRewardSchema.parse(valid);
    expect(parsed.loot).toHaveLength(1);
    expect(parsed.loot[0].itemTemplateId).toBe('item-1');
  });

  it('accepts a full reward with xp and recipeUnlocked', () => {
    const valid = {
      loot: [{ itemTemplateId: 'item-1', quantity: 1, rarity: 'rare', itemName: 'Dragon Fang' }],
      xp: {
        skillType: 'melee',
        rawXp: 500,
        xpAfterEfficiency: 450,
        leveledUp: true,
        newLevel: 15,
      },
      recipeUnlocked: {
        recipeId: 'recipe-1',
        recipeName: 'Dragon Blade',
        soulbound: true,
      },
    };
    expect(bossPlayerRewardSchema.parse(valid)).toEqual(valid);
  });

  it('rejects loot item missing itemTemplateId', () => {
    const invalid = {
      loot: [{ quantity: 2 }],
    };
    expect(() => bossPlayerRewardSchema.parse(invalid)).toThrow();
  });

  it('rejects loot item missing quantity', () => {
    const invalid = {
      loot: [{ itemTemplateId: 'item-1' }],
    };
    expect(() => bossPlayerRewardSchema.parse(invalid)).toThrow();
  });

  it('rejects xp block missing required fields', () => {
    const invalid = {
      loot: [],
      xp: { skillType: 'melee' },
    };
    expect(() => bossPlayerRewardSchema.parse(invalid)).toThrow();
  });

  it('rejects recipeUnlocked missing soulbound', () => {
    const invalid = {
      loot: [],
      recipeUnlocked: { recipeId: 'r1', recipeName: 'Test' },
    };
    expect(() => bossPlayerRewardSchema.parse(invalid)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseBossEffects
// ---------------------------------------------------------------------------

describe('parseBossEffects', () => {
  it('returns empty array for null input', () => {
    expect(parseBossEffects(null, 'test')).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(parseBossEffects(undefined, 'test')).toEqual([]);
  });

  it('parses a valid array of BossActiveEffect', () => {
    const effects = [
      { name: 'Weaken', stat: 'defence', modifier: -5, roundsRemaining: 3 },
    ];
    expect(parseBossEffects(effects, 'test')).toEqual(effects);
  });

  it('returns empty array and warns for non-array input', () => {
    expect(parseBossEffects('not-an-array', 'test')).toEqual([]);
  });

  it('returns empty array and warns when array elements are malformed', () => {
    const malformed = [{ name: 'Weaken' }]; // missing stat, modifier, roundsRemaining
    expect(parseBossEffects(malformed, 'test')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseBossRoundSummaries
// ---------------------------------------------------------------------------

describe('parseBossRoundSummaries', () => {
  it('returns null for null input', () => {
    expect(parseBossRoundSummaries(null, 'test')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseBossRoundSummaries(undefined, 'test')).toBeNull();
  });

  it('parses a valid array of BossRoundSummary', () => {
    const summaries = [
      { round: 1, bossDamage: 50, totalPlayerDamage: 200, bossHpPercent: 80, playersAlive: 3, playersDead: 1 },
    ];
    expect(parseBossRoundSummaries(summaries, 'test')).toEqual(summaries);
  });

  it('returns null and warns for malformed array elements', () => {
    const malformed = [{ round: 'one' }];
    expect(parseBossRoundSummaries(malformed, 'test')).toBeNull();
  });

  it('returns null and warns for non-array input', () => {
    expect(parseBossRoundSummaries('not-an-array', 'test')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseBossRewardsByPlayer
// ---------------------------------------------------------------------------

describe('parseBossRewardsByPlayer', () => {
  it('returns null for null input', () => {
    expect(parseBossRewardsByPlayer(null, 'test')).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(parseBossRewardsByPlayer(undefined, 'test')).toBeNull();
  });

  it('parses a valid record of BossPlayerReward', () => {
    const rewards = {
      'player-1': {
        loot: [{ itemTemplateId: 'item-1', quantity: 1 }],
      },
    };
    expect(parseBossRewardsByPlayer(rewards, 'test')).toEqual(rewards);
  });

  it('returns null and warns for malformed reward values', () => {
    const malformed = {
      'player-1': { loot: 'not-an-array' },
    };
    expect(parseBossRewardsByPlayer(malformed, 'test')).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseBossRewardsByPlayer('not-an-object', 'test')).toBeNull();
  });

  it('returns null for array input (not a record)', () => {
    expect(parseBossRewardsByPlayer([1, 2, 3], 'test')).toBeNull();
  });
});
