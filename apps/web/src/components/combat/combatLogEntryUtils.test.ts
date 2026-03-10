import { describe, expect, it } from 'vitest';

import { formatHitBreakdown } from './combatLogEntryUtils';

describe('formatHitBreakdown', () => {
  it('formats score-based hit breakdowns from mode-aware combat logs', () => {
    const text = formatHitBreakdown({
      roll: 4,
      accuracyModifier: 0,
      hitChance: 0.25,
      hitRollValue: 0.95,
      attackerHitScore: 12,
      defenderAvoidScore: 2,
    });

    expect(text).toContain('Roll: 4');
    expect(text).toContain('25.0% chance');
    expect(text).toContain('12 hit vs 2 avoid');
    expect(text).toContain('0.95');
    expect(text).toContain('Miss');
    expect(text).not.toContain('10 +');
  });

  it('does not fabricate threshold math for old combat logs', () => {
    const text = formatHitBreakdown({
      roll: 4,
      accuracyModifier: 0,
      targetDodge: 2,
      targetEvasion: 0,
    });

    expect(text).toBeNull();
  });
});
