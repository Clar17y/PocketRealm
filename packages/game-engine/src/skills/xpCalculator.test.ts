import { describe, expect, it } from 'vitest';
import {
  xpForLevel,
  levelFromXp,
  characterLevelFromXp,
  xpToNextLevel,
  calculateEfficiency,
  getWindowsPerDay,
  getWindowCap,
  applyXpGain,
  getWindowIndex,
  shouldResetWindowCap,
  calculateCharacterXpGain,
} from './xpCalculator';
import {
  SKILL_CONSTANTS,
  CHARACTER_CONSTANTS,
} from '@pocketrealm/shared';

describe('xpForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(xpForLevel(1)).toBe(0);
  });

  it('returns 0 for level 0 or negative', () => {
    expect(xpForLevel(0)).toBe(0);
    expect(xpForLevel(-5)).toBe(0);
  });

  it('calculates XP for level 2 using early-level scaling', () => {
    // level 2: base = min(100, 2*10) = 20, xp = floor(20 * 2^2) = 80
    const base = Math.min(
      SKILL_CONSTANTS.XP_BASE,
      2 * SKILL_CONSTANTS.XP_EARLY_LEVEL_SCALE,
    );
    const expected = Math.floor(base * Math.pow(2, SKILL_CONSTANTS.XP_EXPONENT));
    expect(xpForLevel(2)).toBe(expected);
  });

  it('flattens early levels (1-9) compared to level 10+', () => {
    // At level 10, early scale = 10*10 = 100 = XP_BASE, so no discount
    expect(xpForLevel(10)).toBe(
      Math.floor(SKILL_CONSTANTS.XP_BASE * Math.pow(10, SKILL_CONSTANTS.XP_EXPONENT)),
    );
    // At level 5, early scale = 5*10 = 50 < 100, so 50% discount
    const base5 = 5 * SKILL_CONSTANTS.XP_EARLY_LEVEL_SCALE;
    expect(xpForLevel(5)).toBe(
      Math.floor(base5 * Math.pow(5, SKILL_CONSTANTS.XP_EXPONENT)),
    );
  });

  it('matches issue #213 expected values', () => {
    expect(xpForLevel(2)).toBe(80);    // was 400
    expect(xpForLevel(3)).toBe(270);   // was 900
    expect(xpForLevel(5)).toBe(1250);  // was 2500
    expect(xpForLevel(7)).toBe(3430);  // was 4900
  });

  it('is unchanged at level 10+', () => {
    for (const lvl of [10, 15, 20, 50]) {
      expect(xpForLevel(lvl)).toBe(
        Math.floor(SKILL_CONSTANTS.XP_BASE * Math.pow(lvl, SKILL_CONSTANTS.XP_EXPONENT)),
      );
    }
  });

  it('XP requirements increase monotonically', () => {
    for (let lvl = 2; lvl <= 20; lvl++) {
      expect(xpForLevel(lvl + 1)).toBeGreaterThan(xpForLevel(lvl));
    }
  });
});

describe('levelFromXp', () => {
  it('returns level 1 for 0 XP', () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it('returns level 1 for negative XP', () => {
    expect(levelFromXp(-100)).toBe(1);
  });

  it('returns the correct level just before and at a threshold', () => {
    const xpFor5 = xpForLevel(5);
    expect(levelFromXp(xpFor5 - 1)).toBe(4);
    expect(levelFromXp(xpFor5)).toBe(5);
  });

  it('caps at MAX_LEVEL', () => {
    expect(levelFromXp(Number.MAX_SAFE_INTEGER)).toBe(SKILL_CONSTANTS.MAX_LEVEL);
  });

  it('roundtrips with xpForLevel', () => {
    for (const lvl of [1, 5, 10, 25, 50]) {
      expect(levelFromXp(xpForLevel(lvl))).toBe(lvl);
    }
  });
});

describe('characterLevelFromXp', () => {
  it('returns level 1 for 0 XP', () => {
    expect(characterLevelFromXp(0)).toBe(1);
  });

  it('returns level 1 for negative XP', () => {
    expect(characterLevelFromXp(-100)).toBe(1);
  });

  it('caps at CHARACTER_CONSTANTS.MAX_LEVEL', () => {
    expect(characterLevelFromXp(Number.MAX_SAFE_INTEGER)).toBe(
      CHARACTER_CONSTANTS.MAX_LEVEL,
    );
  });

  it('uses same XP curve as skill levels', () => {
    const xpFor10 = xpForLevel(10);
    expect(characterLevelFromXp(xpFor10)).toBe(10);
  });
});

describe('xpToNextLevel', () => {
  it('returns XP needed from 0 to level 2', () => {
    const needed = xpToNextLevel(0, 1);
    expect(needed).toBe(xpForLevel(2));
  });

  it('returns 0 at max level', () => {
    expect(xpToNextLevel(999999, SKILL_CONSTANTS.MAX_LEVEL)).toBe(0);
  });

  it('returns remaining XP correctly mid-level', () => {
    const xpFor5 = xpForLevel(5);
    const xpFor6 = xpForLevel(6);
    const currentXp = xpFor5 + 50;
    expect(xpToNextLevel(currentXp, 5)).toBe(xpFor6 - currentXp);
  });

  it('returns 0 when currentXp exceeds next level', () => {
    const xpFor3 = xpForLevel(3);
    // If someone has more XP than level 3 requires, at level 2
    expect(xpToNextLevel(xpFor3 + 100, 2)).toBe(0);
  });
});

describe('getWindowsPerDay', () => {
  it('returns 24 / XP_WINDOW_HOURS', () => {
    expect(getWindowsPerDay()).toBe(24 / SKILL_CONSTANTS.XP_WINDOW_HOURS);
  });

  it('returns a positive integer', () => {
    const windows = getWindowsPerDay();
    expect(windows).toBeGreaterThan(0);
    expect(Number.isInteger(windows)).toBe(true);
  });
});

describe('getWindowCap', () => {
  it('returns combat cap for combat skills', () => {
    const windows = getWindowsPerDay();
    const expected = Math.floor(SKILL_CONSTANTS.DAILY_CAP_COMBAT / windows);
    expect(getWindowCap('melee')).toBe(expected);
    expect(getWindowCap('ranged')).toBe(expected);
    expect(getWindowCap('magic')).toBe(expected);
  });

  it('returns gathering cap for gathering skills', () => {
    const windows = getWindowsPerDay();
    const expected = Math.floor(SKILL_CONSTANTS.DAILY_CAP_GATHERING / windows);
    expect(getWindowCap('mining')).toBe(expected);
    expect(getWindowCap('foraging')).toBe(expected);
    expect(getWindowCap('woodcutting')).toBe(expected);
  });

  it('returns processing cap for processing skills', () => {
    const windows = getWindowsPerDay();
    const expected = Math.floor(SKILL_CONSTANTS.DAILY_CAP_PROCESSING / windows);
    expect(getWindowCap('refining')).toBe(expected);
  });

  it('returns crafting cap for crafting skills', () => {
    const windows = getWindowsPerDay();
    const expected = Math.floor(SKILL_CONSTANTS.DAILY_CAP_CRAFTING / windows);
    expect(getWindowCap('weaponsmithing')).toBe(expected);
    expect(getWindowCap('alchemy')).toBe(expected);
  });
});

describe('calculateEfficiency', () => {
  it('returns 1 when no XP has been gained', () => {
    expect(calculateEfficiency(0, 'mining')).toBe(1);
    expect(calculateEfficiency(0, 'melee')).toBe(1);
  });

  it('returns 0 when at or above cap', () => {
    const combatCap = getWindowCap('melee');
    expect(calculateEfficiency(combatCap, 'melee')).toBe(0);
    expect(calculateEfficiency(combatCap + 100, 'melee')).toBe(0);

    const gatherCap = getWindowCap('mining');
    expect(calculateEfficiency(gatherCap, 'mining')).toBe(0);
    expect(calculateEfficiency(gatherCap + 100, 'mining')).toBe(0);
  });

  it('all skills have diminishing returns (quadratic decay)', () => {
    // Combat skill
    const combatCap = getWindowCap('melee');
    const combatHalf = Math.floor(combatCap / 2);
    const combatEff = calculateEfficiency(combatHalf, 'melee');
    expect(combatEff).toBeGreaterThan(0);
    expect(combatEff).toBeLessThan(1);
    // At 50% of cap, quadratic decay: 1 - 0.5^2 = 0.75
    expect(combatEff).toBeCloseTo(0.75, 1);

    // Gathering skill
    const gatherCap = getWindowCap('mining');
    const gatherHalf = Math.floor(gatherCap / 2);
    const gatherEff = calculateEfficiency(gatherHalf, 'mining');
    expect(gatherEff).toBeGreaterThan(0);
    expect(gatherEff).toBeLessThan(1);
    expect(gatherEff).toBeCloseTo(0.75, 1);
  });

  it('efficiency decreases as XP gained increases', () => {
    const cap = getWindowCap('melee');
    const eff25 = calculateEfficiency(Math.floor(cap * 0.25), 'melee');
    const eff50 = calculateEfficiency(Math.floor(cap * 0.50), 'melee');
    const eff75 = calculateEfficiency(Math.floor(cap * 0.75), 'melee');
    expect(eff25).toBeGreaterThan(eff50);
    expect(eff50).toBeGreaterThan(eff75);
    expect(eff75).toBeGreaterThan(0);
  });
});

describe('applyXpGain', () => {
  it('applies full XP when efficiency is 1', () => {
    const result = applyXpGain(0, 1, 0, 100, 'melee');
    expect(result.xpGained).toBe(100);
    expect(result.xpAfterEfficiency).toBe(100);
    expect(result.efficiency).toBe(1);
  });

  it('applies 0 XP when at cap', () => {
    const cap = getWindowCap('melee');
    const result = applyXpGain(1000, 5, cap, 100, 'melee');
    expect(result.xpAfterEfficiency).toBe(0);
    expect(result.efficiency).toBe(0);
  });

  it('detects level up', () => {
    const xpFor2 = xpForLevel(2);
    const result = applyXpGain(0, 1, 0, xpFor2, 'melee');
    expect(result.leveledUp).toBe(true);
    expect(result.newLevel).toBe(2);
  });

  it('does not report level up when staying same level', () => {
    const result = applyXpGain(0, 1, 0, 10, 'melee');
    expect(result.leveledUp).toBe(false);
    expect(result.newLevel).toBe(1);
  });

  it('reports atDailyCap when window becomes exhausted', () => {
    const cap = getWindowCap('mining');
    const result = applyXpGain(0, 1, cap, 50, 'mining');
    expect(result.atDailyCap).toBe(true);
    expect(result.xpAfterEfficiency).toBe(0);
  });

  it('diminishing returns reduce XP for non-combat skills', () => {
    const cap = getWindowCap('mining');
    const halfCap = Math.floor(cap / 2);
    const result = applyXpGain(0, 1, halfCap, 100, 'mining');
    expect(result.xpAfterEfficiency).toBeLessThan(100);
    expect(result.xpAfterEfficiency).toBeGreaterThan(0);
  });
});

describe('getWindowIndex', () => {
  it('returns 0 for midnight', () => {
    const midnight = new Date(2026, 1, 4, 0, 0, 0);
    expect(getWindowIndex(midnight)).toBe(0);
  });

  it('returns correct index for different hours', () => {
    const windowHours = SKILL_CONSTANTS.XP_WINDOW_HOURS; // 12
    expect(getWindowIndex(new Date(2026, 1, 4, 5, 0, 0))).toBe(
      Math.floor(5 / windowHours),
    );
    expect(getWindowIndex(new Date(2026, 1, 4, 12, 0, 0))).toBe(
      Math.floor(12 / windowHours),
    );
    expect(getWindowIndex(new Date(2026, 1, 4, 23, 0, 0))).toBe(
      Math.floor(23 / windowHours),
    );
  });
});

describe('shouldResetWindowCap', () => {
  it('does not reset within the rolling 12-hour window', () => {
    const lastResetAt = new Date(2026, 1, 4, 1, 0, 0);
    const now = new Date(2026, 1, 4, 12, 59, 59);
    expect(shouldResetWindowCap(lastResetAt, now)).toBe(false);
  });

  it('resets when the rolling 12-hour window duration elapses', () => {
    const lastResetAt = new Date(2026, 1, 4, 1, 0, 0);
    const now = new Date(2026, 1, 4, 13, 0, 0);
    expect(shouldResetWindowCap(lastResetAt, now)).toBe(true);
  });

  it('does not reset just because the day changes (rolling windows)', () => {
    const lastResetAt = new Date(2026, 1, 3, 23, 0, 0);
    const now = new Date(2026, 1, 4, 0, 30, 0);
    expect(shouldResetWindowCap(lastResetAt, now)).toBe(false);
  });

  it('does not reset when now is before lastResetAt', () => {
    const lastResetAt = new Date(2026, 1, 4, 13, 0, 0);
    const now = new Date(2026, 1, 4, 12, 0, 0);
    expect(shouldResetWindowCap(lastResetAt, now)).toBe(false);
  });
});

describe('calculateCharacterXpGain', () => {
  it('applies CHARACTER_CONSTANTS.XP_RATIO', () => {
    expect(calculateCharacterXpGain(100)).toBe(
      Math.floor(100 * CHARACTER_CONSTANTS.XP_RATIO),
    );
  });

  it('returns 0 for 0 input', () => {
    expect(calculateCharacterXpGain(0)).toBe(0);
  });

  it('floors the result', () => {
    // 1 * 0.3 = 0.3 → floor = 0
    expect(calculateCharacterXpGain(1)).toBe(0);
  });
});
