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

  it('guarantees at least 1 HP regen per minute for low-HP mobs', () => {
    // Small maxHp so raw regen is fractional (3 * 1 / 100 = 0.03)
    // After 1 full minute, guarantee at least 1 HP
    const smallMaxHp = 3;
    const oneMinLater = new Date(baseTime.getTime() + 60_000);
    const result = calculatePersistedMobHp(1, smallMaxHp, baseTime, oneMinLater);
    expect(result).toBe(2); // rawRegen < 1 but elapsedMinutes >= 1 → 1 HP, so 1 + 1 = 2
  });

  it('does not regen low-HP mobs before 1 minute has elapsed', () => {
    // Sub-minute check should not grant regen for low-HP mobs
    const smallMaxHp = 3;
    const thirtySecsLater = new Date(baseTime.getTime() + 30_000);
    const result = calculatePersistedMobHp(1, smallMaxHp, baseTime, thirtySecsLater);
    expect(result).toBe(1); // rawRegen < 1 and elapsedMinutes < 1 → 0 HP regen
  });
});
