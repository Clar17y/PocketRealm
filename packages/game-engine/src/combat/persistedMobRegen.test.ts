import { describe, expect, it } from 'vitest';
import { calculatePersistedMobHp } from './persistedMobRegen';
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';

describe('calculatePersistedMobHp', () => {
  const maxHp = 1000;
  const baseTime = new Date('2026-02-04T12:00:00Z');

  it('returns savedHp when no time has elapsed', () => {
    expect(calculatePersistedMobHp(500, maxHp, baseTime, baseTime)).toBe(500);
  });

  it('regenerates 1% of maxHp per minute by default', () => {
    const oneMinLater = new Date(baseTime.getTime() + 60_000);
    const regenPct = WORLD_EVENT_CONSTANTS.PERSISTED_MOB_REGEN_PERCENT_PER_MINUTE;
    const expectedRegen = Math.floor(maxHp * regenPct / 100);
    expect(calculatePersistedMobHp(500, maxHp, baseTime, oneMinLater)).toBe(
      500 + expectedRegen,
    );
  });

  it('caps at maxHp', () => {
    const tenMinLater = new Date(baseTime.getTime() + 600_000);
    expect(
      calculatePersistedMobHp(990, maxHp, baseTime, tenMinLater),
    ).toBe(maxHp);
  });

  it('handles now before damagedAt (negative elapsed)', () => {
    const before = new Date(baseTime.getTime() - 60_000);
    expect(calculatePersistedMobHp(500, maxHp, baseTime, before)).toBe(500);
  });

  it('already at maxHp stays at maxHp', () => {
    const later = new Date(baseTime.getTime() + 300_000);
    expect(calculatePersistedMobHp(maxHp, maxHp, baseTime, later)).toBe(maxHp);
  });

  it('floors regen amount', () => {
    // Small maxHp so regen is fractional
    const smallMaxHp = 3;
    const oneMinLater = new Date(baseTime.getTime() + 60_000);
    const result = calculatePersistedMobHp(1, smallMaxHp, baseTime, oneMinLater);
    expect(result).toBe(1); // floor(3 * 1 / 100) = 0, so 1 + 0 = 1
  });
});
