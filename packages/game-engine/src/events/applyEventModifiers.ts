import type { ActiveZoneModifiers, MobTemplate } from '@adventure/shared';

/**
 * Apply active zone mob modifiers to a mob template (damage/hp multipliers).
 * Returns a modified copy — does not mutate the original.
 */
export function applyMobEventModifiers(
  mob: MobTemplate,
  modifiers: ActiveZoneModifiers,
): MobTemplate {
  if (
    modifiers.mobDamageMultiplier === 1 &&
    modifiers.mobHpMultiplier === 1
  ) {
    return mob;
  }

  const hpMult = Math.max(0.1, modifiers.mobHpMultiplier);
  const dmgMult = Math.max(0.1, modifiers.mobDamageMultiplier);

  return {
    ...mob,
    hp: Math.max(1, Math.round(mob.hp * hpMult)),
    damageMin: Math.max(1, Math.round(mob.damageMin * dmgMult)),
    damageMax: Math.max(1, Math.round(mob.damageMax * dmgMult)),
  };
}

/**
 * Apply active zone resource modifiers to a base yield.
 * Returns the modified yield.
 */
export function applyResourceEventModifiers(
  baseYield: number,
  modifiers: ActiveZoneModifiers,
): number {
  return Math.max(1, Math.round(baseYield * modifiers.resourceYieldMultiplier));
}

/**
 * Compute combined resource yield multiplier from a list of event effects.
 * Works with any shape that has effectType + effectValue (badges, event data, etc).
 */
export function computeResourceYieldMultiplier(
  effects: ReadonlyArray<{ effectType: string; effectValue: number }>,
): number {
  let m = 1;
  for (const e of effects) {
    if (e.effectType === 'yield_up') m *= (1 + e.effectValue);
    if (e.effectType === 'yield_down') m *= Math.max(0.1, 1 - e.effectValue);
  }
  return m;
}

/**
 * Minimum actions so a yield penalty always produces a visible integer reduction.
 * Returns 1 when there is no penalty (multiplier >= 1).
 */
export function computeEventMinActions(yieldMultiplier: number): number {
  return yieldMultiplier < 1 ? Math.ceil(1 / (1 - yieldMultiplier)) : 1;
}
