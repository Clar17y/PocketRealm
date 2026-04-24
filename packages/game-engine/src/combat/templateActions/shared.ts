import type { ActionDefinition, CombatAction } from '@pocketrealm/shared';

export function applyActionDefenceReduction(defence: number, reductionPercent?: number): number {
  if (!reductionPercent || reductionPercent <= 0) {
    return defence;
  }

  return Math.max(0, Math.floor(defence * (1 - reductionPercent / 100)));
}

export function actionToCombatAction(action: ActionDefinition): CombatAction {
  if (action.category === 'offensive') {
    return 'attack';
  }
  if (action.category === 'defensive') {
    return 'defend';
  }
  if (action.actionType === 'use_potion') {
    return 'potion';
  }
  if (action.actionType === 'use_cleanse_potion') {
    return 'cleanse';
  }
  if (action.actionType === 'use_buff_potion') {
    return 'potion';
  }
  return 'spell';
}
