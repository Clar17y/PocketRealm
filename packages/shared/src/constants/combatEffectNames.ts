import { BASE_ACTION_DEFINITIONS } from './combatActionDefinitions';
import { BOSS_ACTION_DEFINITIONS } from './bossTemplateDefinitions';

export interface EffectNameOption {
  name: string;
  category: 'buff' | 'debuff' | 'status';
  description: string;
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
      description: `${def.effect.stat} ${def.effect.modifier > 0 ? '+' : ''}${def.effect.modifier} for ${def.effect.duration} rounds`,
    });
  }

  // Boss-applied debuffs (effects players can receive from boss abilities)
  for (const def of Object.values(BOSS_ACTION_DEFINITIONS)) {
    if (!def.effect || !def.effect.isDebuff || seen.has(def.effect.name)) continue;
    seen.add(def.effect.name);
    effects.push({
      name: def.effect.name,
      category: 'debuff',
      description: `${def.effect.stat} ${def.effect.modifier > 0 ? '+' : ''}${def.effect.modifier} for ${def.effect.duration} rounds (boss ability)`,
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
