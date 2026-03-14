import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';

/**
 * Calculate current HP for a persisted mob after passive regeneration.
 * Mobs regen 1% of max HP per minute since they were last damaged.
 */
export function calculatePersistedMobHp(
  savedHp: number,
  maxHp: number,
  damagedAt: Date,
  now: Date,
): number {
  const elapsedMs = Math.max(0, now.getTime() - damagedAt.getTime());
  const elapsedMinutes = elapsedMs / 60_000;
  const regenPercent = elapsedMinutes * WORLD_EVENT_CONSTANTS.PERSISTED_MOB_REGEN_PERCENT_PER_MINUTE;
  const rawRegen = maxHp * regenPercent / 100;
  // Guarantee at least 1 HP per minute for low-HP mobs, but don't round up
  // sub-minute fractional regen (which would grant 1 HP on every check)
  const regenAmount = rawRegen >= 1 ? Math.floor(rawRegen) : (elapsedMinutes >= 1 ? 1 : 0);
  return Math.min(maxHp, savedHp + regenAmount);
}
