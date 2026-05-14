import { getActionDefinition } from '@pocketrealm/shared/constants/combatActionDefinitions';
/**
 * Maps template combat engine log entries (combatant-indexed fields) to
 * the frontend response shape (actor-relative fields).
 *
 * Engine produces: combatantAAction, combatantAStaminaAfter, combatantBManaAfter, etc.
 * Frontend expects: actionName, staminaAfter, manaAfter, staminaCost, manaCost, etc.
 */
interface TemplateCombatFields {
  actor?: string;
  combatantAAction?: string;
  combatantBAction?: string;
  combatantAStaminaAfter?: number;
  combatantBStaminaAfter?: number;
  combatantAManaAfter?: number;
  combatantBManaAfter?: number;
  wasExhausted?: boolean;
  interactionResult?: string;
}

export interface MappedCombatFields {
  actionId?: string;
  actionName?: string;
  staminaAfter?: number;
  manaAfter?: number;
  staminaCost?: number;
  manaCost?: number;
  wasExhausted?: boolean;
  interactionResult?: string;
}

export function mapTemplateCombatLog<T extends TemplateCombatFields>(log: T[]): (T & MappedCombatFields)[] {
  return log.map(entry => {
    if (!entry.combatantAAction && !entry.combatantBAction) return { ...entry };

    const isA = entry.actor === 'combatantA';
    const actionId = isA ? entry.combatantAAction : entry.combatantBAction;
    const actionDef = actionId ? getActionDefinition(actionId) : undefined;

    return {
      ...entry,
      actionId: actionId ?? undefined,
      actionName: actionDef?.name ?? undefined,
      staminaAfter: isA ? entry.combatantAStaminaAfter : entry.combatantBStaminaAfter,
      manaAfter: isA ? entry.combatantAManaAfter : entry.combatantBManaAfter,
      staminaCost: actionDef?.cost?.stamina ?? undefined,
      manaCost: actionDef?.cost?.mana ?? undefined,
      wasExhausted: entry.wasExhausted ?? undefined,
      interactionResult: entry.interactionResult ?? undefined,
    };
  });
}
