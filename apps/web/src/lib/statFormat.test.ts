import { describe, expect, it } from 'vitest';
import {
  STAT_ORDER,
  prettyStatName,
  formatStatValue,
  formatSignedStatValue,
  signedClass,
  numStat,
  statEntries,
  prettyWeightClass,
} from './statFormat';

// ── prettyStatName ───────────────────────────────────────────────────

describe('prettyStatName', () => {
  it('returns "Magic Defence" for magicDefence', () => {
    expect(prettyStatName('magicDefence')).toBe('Magic Defence');
  });

  it('returns "Magic Power" for magicPower', () => {
    expect(prettyStatName('magicPower')).toBe('Magic Power');
  });

  it('returns "Crit Chance" for critChance', () => {
    expect(prettyStatName('critChance')).toBe('Crit Chance');
  });

  it('returns "Crit Damage" for critDamage', () => {
    expect(prettyStatName('critDamage')).toBe('Crit Damage');
  });

  it('splits generic camelCase stat names with spaces', () => {
    expect(prettyStatName('attack')).toBe('Attack');
  });

  it('capitalizes first letter of single-word stat', () => {
    expect(prettyStatName('armor')).toBe('Armor');
  });

  it('splits multi-word camelCase correctly', () => {
    expect(prettyStatName('someStatName')).toBe('Some Stat Name');
  });

  it('handles already-capitalized first letter', () => {
    expect(prettyStatName('Health')).toBe('Health');
  });

});

// ── formatStatValue ──────────────────────────────────────────────────

describe('formatStatValue', () => {
  it('formats critChance as percentage', () => {
    expect(formatStatValue('critChance', 0.15)).toBe('15%');
  });

  it('formats critDamage as percentage', () => {
    expect(formatStatValue('critDamage', 1.5)).toBe('150%');
  });

  it('rounds percentage values', () => {
    expect(formatStatValue('critChance', 0.156)).toBe('16%');
  });

  it('formats zero percent', () => {
    expect(formatStatValue('critChance', 0)).toBe('0%');
  });

  it('formats non-percent stat as plain string', () => {
    expect(formatStatValue('attack', 42)).toBe('42');
  });

  it('formats zero non-percent stat', () => {
    expect(formatStatValue('armor', 0)).toBe('0');
  });

  it('formats negative non-percent stat', () => {
    expect(formatStatValue('health', -5)).toBe('-5');
  });

  it('formats fractional non-percent stat as-is', () => {
    expect(formatStatValue('luck', 3.7)).toBe('3.7');
  });
});

// ── formatSignedStatValue ────────────────────────────────────────────

describe('formatSignedStatValue', () => {
  it('adds + prefix for positive non-percent value', () => {
    expect(formatSignedStatValue('attack', 10)).toBe('+10');
  });

  it('adds - prefix for negative non-percent value', () => {
    expect(formatSignedStatValue('armor', -3)).toBe('-3');
  });

  it('no sign for zero value', () => {
    expect(formatSignedStatValue('health', 0)).toBe('0');
  });

  it('adds + prefix for positive percent stat', () => {
    expect(formatSignedStatValue('critChance', 0.1)).toBe('+10%');
  });

  it('adds - prefix for negative percent stat', () => {
    expect(formatSignedStatValue('critDamage', -0.25)).toBe('-25%');
  });

  it('uses absolute value for formatting (negative does not double-negate)', () => {
    // -5 -> Math.abs(-5) = 5 -> formatStatValue('attack', 5) = '5' -> '-5'
    expect(formatSignedStatValue('attack', -5)).toBe('-5');
  });

  it('zero percent stat has no sign', () => {
    expect(formatSignedStatValue('critChance', 0)).toBe('0%');
  });
});

// ── signedClass ──────────────────────────────────────────────────────

describe('signedClass', () => {
  it('returns positiveClass for positive value', () => {
    expect(signedClass(1, 'text-green')).toBe('text-green');
  });

  it('returns positiveClass for zero', () => {
    expect(signedClass(0, 'text-green')).toBe('text-green');
  });

  it('returns red class for negative value', () => {
    expect(signedClass(-1, 'text-green')).toBe('text-[var(--rpg-red)]');
  });

  it('returns red class for large negative', () => {
    expect(signedClass(-999, 'anything')).toBe('text-[var(--rpg-red)]');
  });

  it('returns provided positiveClass unchanged', () => {
    const cls = 'text-[var(--rpg-gold)] font-bold';
    expect(signedClass(5, cls)).toBe(cls);
  });
});

// ── numStat ──────────────────────────────────────────────────────────

describe('numStat', () => {
  it('returns the number for a valid finite number', () => {
    expect(numStat(42)).toBe(42);
  });

  it('returns the number for zero', () => {
    expect(numStat(0)).toBe(0);
  });

  it('returns the number for negative values', () => {
    expect(numStat(-10)).toBe(-10);
  });

  it('returns the number for floating point', () => {
    expect(numStat(3.14)).toBe(3.14);
  });

  it('returns null for NaN', () => {
    expect(numStat(NaN)).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(numStat(Infinity)).toBeNull();
  });

  it('returns null for -Infinity', () => {
    expect(numStat(-Infinity)).toBeNull();
  });

  it.each([
    ['string', '42'],
    ['null', null],
    ['undefined', undefined],
    ['boolean', true],
    ['object', {}],
    ['array', [1, 2]],
  ])('returns null for %s', (_label, value) => {
    expect(numStat(value as Parameters<typeof numStat>[0])).toBeNull();
  });
});

// ── statEntries ──────────────────────────────────────────────────────

describe('statEntries', () => {
  it('returns empty array for null', () => {
    expect(statEntries(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(statEntries(undefined)).toEqual([]);
  });

  it('returns empty array for empty object', () => {
    expect(statEntries({})).toEqual([]);
  });

  it('filters out zero values', () => {
    expect(statEntries({ attack: 0, armor: 5 })).toEqual([['armor', 5]]);
  });

  it('filters out non-number values', () => {
    expect(statEntries({ attack: 'high' as unknown, armor: 10 })).toEqual([['armor', 10]]);
  });

  it('filters out NaN', () => {
    expect(statEntries({ attack: NaN, armor: 3 })).toEqual([['armor', 3]]);
  });

  it('filters out Infinity', () => {
    expect(statEntries({ attack: Infinity, armor: 7 })).toEqual([['armor', 7]]);
  });

  it('filters out -Infinity', () => {
    expect(statEntries({ attack: -Infinity, luck: 2 })).toEqual([['luck', 2]]);
  });

  it('includes negative non-zero numbers', () => {
    expect(statEntries({ armor: -3 })).toEqual([['armor', -3]]);
  });

  it('sorts known stats by STAT_ORDER', () => {
    const result = statEntries({ dodge: 2, attack: 5, armor: 3 });
    expect(result).toEqual([
      ['attack', 5],
      ['armor', 3],
      ['dodge', 2],
    ]);
  });

  it('places unknown stats after known stats', () => {
    const result = statEntries({ customStat: 1, attack: 5 });
    expect(result).toEqual([
      ['attack', 5],
      ['customStat', 1],
    ]);
  });

  it('sorts unknown stats alphabetically among themselves', () => {
    const result = statEntries({ zeta: 1, alpha: 2, beta: 3 });
    expect(result).toEqual([
      ['alpha', 2],
      ['beta', 3],
      ['zeta', 1],
    ]);
  });

  it('handles a full STAT_ORDER set in correct order', () => {
    const stats: Record<string, number> = {};
    // Add in reverse order to verify sorting
    for (let i = STAT_ORDER.length - 1; i >= 0; i--) {
      stats[STAT_ORDER[i]!] = i + 1;
    }
    const result = statEntries(stats);
    const keys = result.map(([k]) => k);
    expect(keys).toEqual(STAT_ORDER);
  });

  it('mixed known and unknown stats sorted correctly', () => {
    const result = statEntries({
      zzCustom: 10,
      luck: 4,
      aaCustom: 7,
      attack: 15,
      health: 50,
    });
    expect(result).toEqual([
      ['attack', 15],
      ['health', 50],
      ['luck', 4],
      ['aaCustom', 7],
      ['zzCustom', 10],
    ]);
  });

  it('preserves float values', () => {
    expect(statEntries({ critChance: 0.15 })).toEqual([['critChance', 0.15]]);
  });
});

// ── prettyWeightClass ────────────────────────────────────────────────

describe('prettyWeightClass', () => {
  it('returns "Heavy Armor" for heavy', () => {
    expect(prettyWeightClass('heavy')).toBe('Heavy Armor');
  });

  it('returns "Medium Armor" for medium', () => {
    expect(prettyWeightClass('medium')).toBe('Medium Armor');
  });

  it('returns "Light Armor" for light', () => {
    expect(prettyWeightClass('light')).toBe('Light Armor');
  });

  it('returns null for null', () => {
    expect(prettyWeightClass(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(prettyWeightClass(undefined)).toBeNull();
  });
});
