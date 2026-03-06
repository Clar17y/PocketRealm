import {
  getAllMobPrefixes,
  getMobPrefixDefinition,
  NO_PREFIX_WEIGHT,
  type MobTemplate,
  type SpellAction,
  type SpellTemplate,
} from '@pocketrealm/shared';

const MAX_PREFIX_SPELL_ROUND = 100;

export type PrefixedMob<TMob extends MobTemplate = MobTemplate> = TMob & {
  mobPrefix: string | null;
  mobDisplayName: string;
  dropChanceMultiplier: number;
};

export function rollMobPrefix(): string | null {
  const prefixes = getAllMobPrefixes();
  const prefixWeight = prefixes.reduce((sum, prefix) => sum + prefix.weight, 0);
  const totalWeight = NO_PREFIX_WEIGHT + prefixWeight;

  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  roll -= NO_PREFIX_WEIGHT;
  if (roll < 0) return null;

  for (const prefix of prefixes) {
    roll -= prefix.weight;
    if (roll < 0) return prefix.key;
  }

  return prefixes[prefixes.length - 1]?.key ?? null;
}

function scaleStat(value: number, multiplier: number | undefined, minimum: number): number {
  const applied = Math.floor(value * (multiplier ?? 1));
  return Math.max(minimum, applied);
}

function dedupeSpellsByRound(spells: SpellAction[]): SpellAction[] {
  const seen = new Set<number>();
  const merged: SpellAction[] = [];
  for (const spell of spells) {
    if (seen.has(spell.round)) continue;
    seen.add(spell.round);
    merged.push(spell);
  }
  return merged;
}

export function generatePrefixSpells(
  template: SpellTemplate,
  damageMin: number,
  damageMax: number
): SpellAction[] {
  if (template.interval <= 0 || template.startRound <= 0) return [];

  const baseDamage = template.damageFormula === 'min'
    ? damageMin
    : template.damageFormula === 'max'
      ? damageMax
      : Math.floor((damageMin + damageMax) / 2);

  const damage = Math.max(1, Math.floor(baseDamage * template.damageMultiplier));
  const actions: SpellAction[] = [];

  for (let round = template.startRound; round <= MAX_PREFIX_SPELL_ROUND; round += template.interval) {
    actions.push({
      round,
      name: template.actionName,
      damage,
    });
  }

  return actions;
}

export function applyMobPrefix<TMob extends MobTemplate>(
  mob: TMob,
  prefixKey: string | null | undefined
): PrefixedMob<TMob> {
  const prefix = getMobPrefixDefinition(prefixKey);
  if (!prefix) {
    return {
      ...mob,
      mobPrefix: null,
      mobDisplayName: mob.name,
      dropChanceMultiplier: 1,
    };
  }

  const hp = scaleStat(mob.hp, prefix.statMultipliers.hp, 1);
  const accuracy = scaleStat(mob.accuracy, prefix.statMultipliers.accuracy, 0);
  const defence = scaleStat(mob.defence, prefix.statMultipliers.defence, 0);
  const evasion = scaleStat(mob.evasion, prefix.statMultipliers.evasion, 0);
  const magicDefence = scaleStat(mob.magicDefence, prefix.statMultipliers.magicDefence, 0);
  const damageMin = scaleStat(mob.damageMin, prefix.statMultipliers.damageMin, 1);
  const damageMax = scaleStat(mob.damageMax, prefix.statMultipliers.damageMax, 1);
  const normalizedDamageMax = Math.max(damageMin, damageMax);
  const xpReward = scaleStat(mob.xpReward, prefix.xpMultiplier, 1);
  const damageType = prefix.damageTypeOverride ?? mob.damageType;

  const baseSpells = Array.isArray(mob.spellPattern) ? mob.spellPattern : [];
  const prefixSpells = prefix.spellTemplate
    ? generatePrefixSpells(prefix.spellTemplate, damageMin, normalizedDamageMax)
    : [];

  const spellPattern = dedupeSpellsByRound(
    [...prefixSpells, ...baseSpells]
      .filter((spell) => Number.isFinite(spell.round) && spell.round > 0)
      .sort((a, b) => a.round - b.round)
  );

  return {
    ...mob,
    name: `${prefix.displayName} ${mob.name}`,
    hp,
    level: mob.level,
    accuracy,
    defence,
    magicDefence,
    evasion,
    damageMin,
    damageMax: normalizedDamageMax,
    xpReward,
    spellPattern,
    damageType,
    mobPrefix: prefix.key,
    mobDisplayName: `${prefix.displayName} ${mob.name}`,
    dropChanceMultiplier: prefix.dropChanceMultiplier,
  };
}
