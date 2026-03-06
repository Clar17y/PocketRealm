import type { MobTemplate, SpellAction, CombatTemplateSlotData, ActionDefinition } from '@pocketrealm/shared';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared';
import { mobToCombatantStats } from './damageCalculator';
import type { TemplateCombatant } from './templateCombatEngine';

/**
 * Convert a mob's spellPattern into a CombatTemplateSlotData[] rotation.
 * Non-spell rounds get normal_attack; spell rounds get a dynamic action ID.
 */
export function mobToTemplate(
  mob: MobTemplate,
  prefixSpells?: SpellAction[],
): CombatTemplateSlotData[] {
  const allSpells = [...(mob.spellPattern || []), ...(prefixSpells || [])];

  if (allSpells.length === 0) {
    return [{ id: 'mob-slot-0', sortOrder: 0, actionId: 'normal_attack' }];
  }

  const maxRound = Math.max(...allSpells.map(s => s.round));
  const template: CombatTemplateSlotData[] = [];

  for (let round = 1; round <= maxRound; round++) {
    const i = round - 1;
    const spell = allSpells.find(s => s.round === round);
    if (spell) {
      const actionId = `mob_spell_${spell.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      template.push({ id: `mob-slot-${i}`, sortOrder: i, actionId });
    } else {
      template.push({ id: `mob-slot-${i}`, sortOrder: i, actionId: 'normal_attack' });
    }
  }

  return template;
}

/**
 * Build action definitions for a mob's spells merged with the base definitions.
 */
export function buildMobActionDefinitions(
  mob: MobTemplate,
  prefixSpells?: SpellAction[],
): Record<string, ActionDefinition> {
  const defs: Record<string, ActionDefinition> = { ...BASE_ACTION_DEFINITIONS };
  const allSpells = [...(mob.spellPattern || []), ...(prefixSpells || [])];

  for (const spell of allSpells) {
    const actionId = `mob_spell_${spell.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    defs[actionId] = {
      id: actionId,
      name: spell.name,
      description: `Mob spell: ${spell.name}`,
      actionType: spell.damage ? 'damage_spell' : spell.heal ? 'heal_self' : 'buff',
      category: spell.damage ? 'offensive' : 'supportive',
      cost: { stamina: 0, mana: 0 },
      damageMultiplier: spell.damage ? 1.0 : undefined,
      damageType: 'magic',
      healFlat: spell.heal,
      effect: spell.effects?.[0] ? {
        name: spell.name,
        stat: spell.effects[0].stat,
        modifier: spell.effects[0].modifier,
        duration: spell.effects[0].duration,
        isDebuff: spell.effects[0].modifier < 0,
      } : undefined,
      isChanneling: !!(spell.heal || (spell.effects && !spell.damage)),
    };
  }

  return defs;
}

/**
 * Build a complete TemplateCombatant from a MobTemplate.
 * Mobs get infinite resources so their template always executes.
 */
export function mobToTemplateCombatant(
  mob: MobTemplate & { currentHp?: number; maxHp?: number },
  prefixSpells?: SpellAction[],
): TemplateCombatant {
  const stats = mobToCombatantStats(mob);
  return {
    id: mob.id,
    name: mob.name,
    stats,
    template: mobToTemplate(mob, prefixSpells),
    stamina: Infinity,
    maxStamina: Infinity,
    staminaRegenPerRound: 0,
    mana: Infinity,
    maxMana: Infinity,
    manaRegenPerRound: 0,
    actionDefinitions: buildMobActionDefinitions(mob, prefixSpells),
  };
}
