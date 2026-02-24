import { describe, it, expect } from 'vitest';
import { getScaledZoneExitChance } from './zoneExitScaling';

describe('getScaledZoneExitChance', () => {
  const base = 0.0001;

  it('returns base chance at 0% explored', () => {
    expect(getScaledZoneExitChance(base, 0)).toBe(base);
  });

  it('returns base chance at exactly 50% (scaling start)', () => {
    expect(getScaledZoneExitChance(base, 50)).toBeCloseTo(base, 8);
  });

  it('returns base at 25% (below scaling start)', () => {
    expect(getScaledZoneExitChance(base, 25)).toBe(base);
  });

  it('increases above 50%', () => {
    expect(getScaledZoneExitChance(base, 75)).toBeGreaterThan(base);
  });

  it('returns ~5.75x at 75%', () => {
    const result = getScaledZoneExitChance(base, 75);
    expect(result).toBeCloseTo(base * 5.75, 8);
  });

  it('returns ~20x at 100%', () => {
    const result = getScaledZoneExitChance(base, 100);
    expect(result).toBeCloseTo(base * 20, 8);
  });

  it('returns 0 when base is 0', () => {
    expect(getScaledZoneExitChance(0, 75)).toBe(0);
  });

  it('returns 0 when base is negative', () => {
    expect(getScaledZoneExitChance(-0.001, 75)).toBe(0);
  });

  it('clamps at 100% explored', () => {
    const at100 = getScaledZoneExitChance(base, 100);
    const at120 = getScaledZoneExitChance(base, 120);
    expect(at120).toBe(at100);
  });
});
