import { describe, expect, it } from 'vitest';
import { formatHitBreakdown } from './combatLogEntryUtils';

describe('formatHitBreakdown', () => {
  it('formats hit breakdown with 2DP percentage and sample', () => {
    const text = formatHitBreakdown({
      hitChance: 0.25,
      hitRollValue: 0.95,
      attackerHitScore: 12,
      defenderAvoidScore: 2,
    });

    expect(text).toBe('25.00% chance (12 hit vs 2 avoid), sample 0.95 => Miss');
  });

  it('formats a hit result', () => {
    const text = formatHitBreakdown({
      hitChance: 0.5,
      hitRollValue: 0.44,
      attackerHitScore: 12,
      defenderAvoidScore: 2,
    });

    expect(text).toBe('50.00% chance (12 hit vs 2 avoid), sample 0.44 => Hit');
  });

  it('returns null when required fields are missing', () => {
    const text = formatHitBreakdown({});
    expect(text).toBeNull();
  });

  it('still accepts legacy fields without breaking (returns null if no new fields)', () => {
    const text = formatHitBreakdown({
      roll: 4,
      accuracyModifier: 0,
    });
    expect(text).toBeNull();
  });
});
