import { ENCOUNTER_SITE_CONSTANTS } from '@pocketrealm/shared';
import type { CombatantStats } from '@pocketrealm/shared';

/**
 * Compute the damage/accuracy multiplier when mobs are crowded together.
 * Formula: 1 / (1 + (aliveMobs - 1) * factor)
 *
 * This represents the penalty applied when multiple mobs share a space —
 * they interfere with each other, reducing their individual effectiveness.
 */
export function computeCrowdedMultiplier(
  aliveMobs: number,
  factor: number = ENCOUNTER_SITE_CONSTANTS.CROWDED_FACTOR,
): number {
  return 1 / (1 + (aliveMobs - 1) * factor);
}

/**
 * Apply the crowded debuff to a mob's combat stats.
 * Reduces damageMin, damageMax, and accuracy proportionally.
 * Does NOT affect defence, magicDefence, evasion, or hp.
 */
export function applyCrowdedDebuff(stats: CombatantStats, aliveMobs: number): CombatantStats {
  const mult = computeCrowdedMultiplier(aliveMobs);
  return {
    ...stats,
    damageMin: Math.floor(stats.damageMin * mult),
    damageMax: Math.floor(stats.damageMax * mult),
    accuracy: Math.floor(stats.accuracy * mult),
  };
}
