import {
  CHARACTER_CONSTANTS,
  COMBAT_CONSTANTS,
  HIT_CURVE_CONSTANTS,
  CombatantStats,
  MobTemplate,
  type CombatMode,
  type HitScoreBreakdown,
  type PlayerAttributes,
  type ScalingStat,
  type PerActionScaling,
} from '@pocketrealm/shared';
import { clamp } from '../utils/math';

function finiteOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Roll a d20 (1-20).
 */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Roll damage within a min-max range.
 */
export function rollDamage(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function calculateHitChance(
  combatMode: CombatMode,
  hitScore: number,
  avoidScore: number,
): HitScoreBreakdown {
  const curve = HIT_CURVE_CONSTANTS[combatMode];
  const safeHitScore = Math.max(1, finiteOrFallback(hitScore, 1));
  const safeAvoidScore = Math.max(0, finiteOrFallback(avoidScore, 0));
  const normalized = 1 / (1 + ((safeAvoidScore + curve.bias) / safeHitScore) ** curve.exponent);
  const hitChance = clamp(normalized, curve.minHitChance, curve.maxHitChance);

  return {
    hitScore: safeHitScore,
    avoidScore: safeAvoidScore,
    hitChance,
  };
}

export function resolveHitCheck(input: {
  combatMode: CombatMode;
  hitScore: number;
  avoidScore: number;
  hitRollValue?: number;
}): HitScoreBreakdown & { hitRollValue: number; didHit: boolean } {
  const breakdown = calculateHitChance(input.combatMode, input.hitScore, input.avoidScore);
  const hitRollValue = clamp(finiteOrFallback(input.hitRollValue ?? Math.random(), 0), 0, 1);

  return {
    ...breakdown,
    hitRollValue,
    didHit: hitRollValue < breakdown.hitChance,
  };
}

/**
 * Temporary compatibility wrapper for legacy callers that still supply
 * d20-style inputs. Later tasks migrate production combat paths to
 * calculateHitChance/resolveHitCheck directly.
 */
export function doesAttackHit(
  attackRoll: number,
  accuracyBonus: number,
  targetDodge: number,
  targetEvasion: number
): boolean {
  if (attackRoll === 20) return true;
  if (attackRoll === 1) return false;

  const totalAttack = attackRoll + accuracyBonus;
  const hitThreshold = 10 + targetDodge + Math.max(0, targetEvasion);
  return totalAttack >= hitThreshold;
}

/**
 * Check if attack is a critical hit.
 */
export function isCriticalHit(bonusCritChance = 0): boolean {
  const totalCritChance = finiteOrFallback(
    COMBAT_CONSTANTS.CRIT_CHANCE + finiteOrFallback(bonusCritChance, 0),
    COMBAT_CONSTANTS.CRIT_CHANCE
  );
  const clampedCritChance = clamp(totalCritChance, 0, 1);
  return Math.random() < clampedCritChance;
}

/**
 * Calculate final damage after armor reduction.
 * Returns { damage, actualMultiplier } so callers can log the actual crit multiplier used.
 */
export function calculateFinalDamage(
  rawDamage: number,
  defence: number,
  isCrit: boolean,
  bonusCritDamage = 0
): { damage: number; actualMultiplier: number } {
  let damage = rawDamage;
  const totalCritMultiplier = finiteOrFallback(
    COMBAT_CONSTANTS.CRIT_MULTIPLIER + finiteOrFallback(bonusCritDamage, 0),
    COMBAT_CONSTANTS.CRIT_MULTIPLIER
  );
  const clampedCritMultiplier = Math.max(0, totalCritMultiplier);
  const actualMultiplier = isCrit ? clampedCritMultiplier : 1;

  if (isCrit) {
    damage = Math.floor(damage * actualMultiplier);
  }

  // Apply defence reduction (diminishing returns)
  const reduction = calculateDefenceReduction(defence);
  damage = Math.floor(damage * (1 - reduction));

  return {
    damage: Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, damage),
    actualMultiplier,
  };
}

/**
 * Calculate initiative for turn order.
 */
export function rollInitiative(speed: number): number {
  return rollD20() + speed;
}

export function calculateDefenceReduction(defence: number): number {
  const safeDefence = Math.max(0, Number.isFinite(defence) ? defence : 0);
  return safeDefence / (safeDefence + 100);
}

/**
 * Convert a MobTemplate into CombatantStats.
 * Accepts optional currentHp/maxHp overrides for wounded or variant mobs.
 */
export function mobToCombatantStats(
  mob: MobTemplate & { currentHp?: number; maxHp?: number }
): CombatantStats {
  return {
    hp: mob.currentHp ?? mob.hp,
    maxHp: mob.maxHp ?? mob.hp,
    attack: mob.accuracy,
    accuracy: mob.accuracy,
    defence: mob.defence,
    magicDefence: mob.magicDefence,
    dodge: mob.evasion,
    evasion: 0,
    damageMin: mob.damageMin,
    damageMax: mob.damageMax,
    speed: 0,
    damageType: mob.damageType,
  };
}

type ConcreteScalingStat = 'melee' | 'ranged' | 'magic';

/**
 * Resolve a ScalingStat to a concrete combat skill.
 * 'weapon' defers to the equipped weapon's required skill, or falls back
 * to the player's highest combat skill (ties: melee > ranged > magic).
 */
export function resolveScalingStat(
  scalingStat: ScalingStat,
  weaponRequiredSkill: 'melee' | 'ranged' | 'magic' | null,
  skillLevels: { melee: number; ranged: number; magic: number }
): ConcreteScalingStat {
  if (scalingStat === 'melee' || scalingStat === 'ranged' || scalingStat === 'magic') {
    return scalingStat;
  }
  // scalingStat === 'weapon'
  if (weaponRequiredSkill) return weaponRequiredSkill;

  // No weapon equipped -- pick highest skill (priority: melee > ranged > magic)
  const { melee, ranged, magic } = skillLevels;
  if (melee >= ranged && melee >= magic) return 'melee';
  if (ranged >= magic) return 'ranged';
  return 'magic';
}

/**
 * Compute per-action damage/accuracy stats from a ScalingStat and player scaling data.
 */
export function resolveActionDamageStats(
  scalingStat: ScalingStat,
  scaling: PerActionScaling
): { damageMin: number; damageMax: number; accuracy: number } {
  const resolved = resolveScalingStat(scalingStat, scaling.weaponRequiredSkill, scaling.skillLevels);

  const skillLevel = scaling.skillLevels[resolved];

  const weaponPower =
    resolved === 'melee'  ? scaling.weaponPower.attack :
    resolved === 'ranged' ? scaling.weaponPower.rangedPower :
                            scaling.weaponPower.magicPower;

  const attributeBonus =
    resolved === 'melee'  ? scaling.attributes.strength * CHARACTER_CONSTANTS.MELEE_DAMAGE_PER_STRENGTH :
    resolved === 'ranged' ? scaling.attributes.dexterity * CHARACTER_CONSTANTS.RANGED_DAMAGE_PER_DEXTERITY :
                            scaling.attributes.intelligence * CHARACTER_CONSTANTS.MAGIC_DAMAGE_PER_INTELLIGENCE;

  const totalAttack = skillLevel + weaponPower + attributeBonus;

  const accuracyAttrBonus =
    resolved === 'melee'  ? scaling.attributes.strength * CHARACTER_CONSTANTS.ACCURACY_PER_STRENGTH :
    resolved === 'ranged' ? scaling.attributes.dexterity * CHARACTER_CONSTANTS.ACCURACY_PER_DEXTERITY :
                            scaling.attributes.intelligence * CHARACTER_CONSTANTS.ACCURACY_PER_INTELLIGENCE;

  return {
    damageMin: 1 + Math.floor(totalAttack / 5),
    damageMax: 5 + Math.floor(totalAttack / 2),
    accuracy: Math.floor(skillLevel / 2) + scaling.equipmentAccuracy + accuracyAttrBonus,
  };
}

/**
 * Build combatant stats from player equipment, proficiencies, and attributes.
 */
export function buildPlayerCombatStats(
  currentHp: number,
  maxHp: number,
  input: { attackStyle: 'melee' | 'ranged' | 'magic'; skillLevel: number; attributes: PlayerAttributes },
  equipmentStats: {
    attack: number;
    rangedPower: number;
    magicPower: number;
    accuracy: number;
    armor: number;
    magicDefence: number;
    health: number;
    dodge: number;
    critChance?: number;
    critDamage?: number;
  }
): CombatantStats {
  const weaponPower = input.attackStyle === 'ranged'
    ? equipmentStats.rangedPower
    : input.attackStyle === 'magic'
      ? equipmentStats.magicPower
      : equipmentStats.attack;

  const attributeDamageBonus = input.attackStyle === 'ranged'
    ? input.attributes.dexterity * CHARACTER_CONSTANTS.RANGED_DAMAGE_PER_DEXTERITY
    : input.attackStyle === 'magic'
      ? input.attributes.intelligence * CHARACTER_CONSTANTS.MAGIC_DAMAGE_PER_INTELLIGENCE
      : input.attributes.strength * CHARACTER_CONSTANTS.MELEE_DAMAGE_PER_STRENGTH;

  const accuracyFromAttribute =
    input.attackStyle === 'melee'  ? input.attributes.strength * CHARACTER_CONSTANTS.ACCURACY_PER_STRENGTH :
    input.attackStyle === 'ranged' ? input.attributes.dexterity * CHARACTER_CONSTANTS.ACCURACY_PER_DEXTERITY :
    input.attackStyle === 'magic'  ? input.attributes.intelligence * CHARACTER_CONSTANTS.ACCURACY_PER_INTELLIGENCE :
    0;

  const totalAttack = input.skillLevel + weaponPower + attributeDamageBonus;

  return {
    hp: Math.min(currentHp, maxHp),
    maxHp,
    attack: totalAttack,
    accuracy: Math.floor(input.skillLevel / 2) + equipmentStats.accuracy + accuracyFromAttribute,
    defence: equipmentStats.armor,
    magicDefence: equipmentStats.magicDefence,
    dodge: equipmentStats.dodge,
    evasion: input.attributes.evasion,
    damageMin: 1 + Math.floor(totalAttack / 5),
    damageMax: 5 + Math.floor(totalAttack / 2),
    speed: Math.floor(input.attributes.evasion / CHARACTER_CONSTANTS.EVASION_TO_SPEED_DIVISOR),
    critChance: equipmentStats.critChance ?? 0,
    critDamage: equipmentStats.critDamage ?? 0,
    damageType: input.attackStyle === 'magic' ? 'magic' : 'physical',
  };
}
