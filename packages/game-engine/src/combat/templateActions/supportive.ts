import type {
  ActionDefinition,
  CombatActor,
  CombatPotion,
  CombatantStats,
  PotionConsumed,
} from '@pocketrealm/shared';
import type { RoundContext, TemplateCombatState } from '../templateCombatTypes';
import { buildLogEntry } from '../templateCombatTypes';
import { applyActionEffect } from '../templateEffects';
import {
  executeBuffPotionAction,
  executeCleanseAction,
  executePotionAction,
} from './potions';

export function executeSupportiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  _actorStats: CombatantStats,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
): void {
  if (action.actionType === 'use_potion') {
    executePotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  if (action.actionType === 'use_cleanse_potion') {
    executeCleanseAction(state, actorKey, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  if (action.actionType === 'use_buff_potion') {
    executeBuffPotionAction(state, actorKey, action, actorName, ctx, availablePotions, potionsConsumed);
    return;
  }

  let healAmount = 0;
  let appliedEffects: ReturnType<typeof buildLogEntry>['effectsApplied'];

  if (action.healFlat || action.healPercent) {
    const combatant = state.combatants[actorKey];
    const flatHeal = action.healFlat ?? 0;
    const percentHeal = Math.floor((action.healPercent ?? 0) * combatant.maxHp);
    const before = combatant.hp;
    combatant.hp = Math.min(combatant.maxHp, combatant.hp + flatHeal + percentHeal);
    healAmount = combatant.hp - before;
  }

  if (action.effect) {
    appliedEffects = applyActionEffect(state, action.effect, actorKey);
  }

  const parts: string[] = [];
  if (healAmount > 0) {
    parts.push(`+${healAmount} HP`);
  }
  if (appliedEffects && appliedEffects.length > 0) {
    const description = appliedEffects
      .map((effect) => `${effect.stat} ${effect.modifier > 0 ? '+' : ''}${effect.modifier} (${effect.duration} rds)`)
      .join(', ');
    parts.push(description);
  }

  const detail = parts.length > 0 ? ` — ${parts.join(', ')}` : '';
  state.log.push(buildLogEntry(state, ctx, {
    actor: actorKey,
    actorName,
    action: 'spell',
    spellName: action.name,
    healAmount: healAmount > 0 ? healAmount : undefined,
    effectsApplied: appliedEffects && appliedEffects.length > 0 ? appliedEffects : undefined,
    message: `${actorName} uses ${action.name}!${detail}`,
  }));
}
