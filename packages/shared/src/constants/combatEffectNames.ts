import { BASE_ACTION_DEFINITIONS } from './combatActionDefinitions';
import { BOSS_ACTION_DEFINITIONS } from './bossTemplateDefinitions';

export interface CombatEffectDisplayData {
  name?: string;
  stat: string;
  modifier: number;
  duration?: number;
  roundsRemaining?: number;
  damagePerRound?: number;
  damagePerRoundPercent?: number;
  dotDamageType?: 'physical' | 'magic';
  healPerRound?: number;
  resolvedDamagePerRound?: number;
  resolvedHealPerRound?: number;
}

export interface EffectNameOption {
  name: string;
  category: 'buff' | 'debuff' | 'status';
  description: string;
}

const STAT_LABELS: Record<string, string> = {
  accuracy: 'Accuracy',
  attack: 'Attack',
  attackPercent: 'Attack',
  defence: 'Defence',
  dodge: 'Dodge',
  evasion: 'Evasion',
  hp: 'HP',
  magicDefence: 'Magic Defence',
  marked_for_death: 'Marked for death',
  nature_cursed: "Nature's curse",
  pinned: 'Forced to defend',
  poison: 'Poison',
  potionSickness: 'Potion Sickness',
  rooted: 'Forced to defend',
  stacking_dot: 'Stacking DoT',
};

function humanizeStat(stat: string): string {
  return stat
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function formatCombatEffectStatLabel(stat: string): string {
  return STAT_LABELS[stat] ?? humanizeStat(stat);
}

export function formatRounds(rounds: number): string {
  return `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
}

export function formatCombatEffectModifier(effect: Pick<CombatEffectDisplayData, 'stat' | 'modifier'>): string {
  const sign = effect.modifier > 0 ? '+' : '';

  if (effect.stat === 'attackPercent') {
    return `${formatCombatEffectStatLabel(effect.stat)} ${sign}${Math.round(effect.modifier * 100)}%`;
  }

  return `${formatCombatEffectStatLabel(effect.stat)} ${sign}${effect.modifier}`;
}

function effectDuration(effect: CombatEffectDisplayData): number | undefined {
  return effect.duration ?? effect.roundsRemaining;
}

function formatDurationSuffix(effect: CombatEffectDisplayData, includeDuration = true): string {
  if (!includeDuration) return '';

  const duration = effectDuration(effect);
  if (duration === undefined || duration >= 999) return '';
  return ` for ${formatRounds(duration)}`;
}

function formatDamageOverTime(effect: CombatEffectDisplayData, includeDuration: boolean): string {
  const type = effect.dotDamageType === 'physical' ? 'Physical' : 'Magic';
  const flatDamage = effect.resolvedDamagePerRound ?? effect.damagePerRound;
  const parts: string[] = [];

  if (flatDamage !== undefined && flatDamage > 0) {
    parts.push(`${flatDamage} damage`);
  }

  if (effect.damagePerRoundPercent !== undefined && effect.damagePerRoundPercent > 0) {
    parts.push(`${effect.damagePerRoundPercent}% of hit damage`);
  }

  const damageText = parts.length > 0 ? parts.join(' + ') : 'damage';
  const stackText = effect.stat === 'stacking_dot' ? ' per stack each round' : ' per round';
  return `${type} DoT: ${damageText}${stackText}${formatDurationSuffix(effect, includeDuration)}`;
}

function formatHealingOverTime(effect: CombatEffectDisplayData, includeDuration: boolean): string {
  const healing = effect.resolvedHealPerRound ?? effect.healPerRound;
  if (healing === undefined || healing <= 0) {
    return `Healing over time${formatDurationSuffix(effect, includeDuration)}`;
  }
  return `Restores ${healing} HP per round${formatDurationSuffix(effect, includeDuration)}`;
}

export function formatCombatEffectDescription(
  effect: CombatEffectDisplayData,
  options: { bossAbility?: boolean; includeDuration?: boolean } = {},
): string {
  let description: string;
  const includeDuration = options.includeDuration ?? true;

  if ((effect.resolvedDamagePerRound ?? effect.damagePerRound ?? 0) > 0 || (effect.damagePerRoundPercent ?? 0) > 0) {
    const damageDescription = formatDamageOverTime(effect, includeDuration);
    description = effect.modifier !== 0
      ? `${formatCombatEffectModifier(effect)} and ${damageDescription}`
      : damageDescription;
  } else if ((effect.resolvedHealPerRound ?? effect.healPerRound ?? 0) > 0) {
    description = formatHealingOverTime(effect, includeDuration);
  } else if (effect.stat === 'pinned' || effect.stat === 'rooted') {
    description = `Forced to defend${formatDurationSuffix(effect, includeDuration)}`;
  } else if (effect.stat === 'marked_for_death') {
    description = `Marked for death${formatDurationSuffix(effect, includeDuration)}`;
  } else if (effect.modifier === 0) {
    description = `${formatCombatEffectStatLabel(effect.stat)}${formatDurationSuffix(effect, includeDuration)}`;
  } else {
    description = `${formatCombatEffectModifier(effect)}${formatDurationSuffix(effect, includeDuration)}`;
  }

  return options.bossAbility ? `${description} (boss ability)` : description;
}

function extractEffects(): EffectNameOption[] {
  const effects: EffectNameOption[] = [];
  const seen = new Set<string>();

  for (const def of Object.values(BASE_ACTION_DEFINITIONS)) {
    if (!def.effect || seen.has(def.effect.name)) continue;
    seen.add(def.effect.name);
    effects.push({
      name: def.effect.name,
      category: def.effect.isDebuff ? 'debuff' : 'buff',
      description: formatCombatEffectDescription(def.effect),
    });
  }

  // Boss-applied debuffs (effects players can receive from boss abilities)
  for (const def of Object.values(BOSS_ACTION_DEFINITIONS)) {
    if (!def.effect || !def.effect.isDebuff || seen.has(def.effect.name)) continue;
    seen.add(def.effect.name);
    effects.push({
      name: def.effect.name,
      category: 'debuff',
      description: formatCombatEffectDescription(def.effect, { bossAbility: true }),
    });
  }

  // Potion Sickness is always available (applied by potion use, not from an action definition)
  if (!seen.has('Potion Sickness')) {
    effects.push({
      name: 'Potion Sickness',
      category: 'status',
      description: 'Prevents potion use for 4 rounds',
    });
  }

  return effects.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export const KNOWN_EFFECTS: readonly EffectNameOption[] = extractEffects();
export const BUFF_EFFECTS = KNOWN_EFFECTS.filter(e => e.category === 'buff');
export const DEBUFF_EFFECTS = KNOWN_EFFECTS.filter(e => e.category === 'debuff' || e.category === 'status');
