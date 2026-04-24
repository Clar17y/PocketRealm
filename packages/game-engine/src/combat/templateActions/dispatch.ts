import type {
  ActionDefinition,
  CombatActor,
  CombatMode,
  CombatPotion,
  CombatantStats,
  PerActionScaling,
  PotionConsumed,
} from '@pocketrealm/shared';
import type { RoundInteraction } from '../actionResolver';
import {
  buildLogEntry,
  type RoundContext,
  type TemplateCombatState,
} from '../templateCombatTypes';
import { resolveScalingStat } from '../damageCalculator';
import { executeOffensiveAction } from './offensive';
import { executeSupportiveAction } from './supportive';

export function executeDefensiveAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  action: ActionDefinition,
  actorName: string,
  ctx: RoundContext,
): void {
  state.log.push(buildLogEntry(state, ctx, {
    round: state.round,
    actor: actorKey,
    actorName,
    action: 'defend',
    message: `${actorName} uses ${action.name}!`,
  }));
}

export function executeAction(
  state: TemplateCombatState,
  actorKey: CombatActor,
  actorStats: CombatantStats,
  targetStats: CombatantStats,
  action: ActionDefinition,
  interaction: RoundInteraction,
  isAttacker: boolean,
  actorName: string,
  targetName: string,
  ctx: RoundContext,
  combatMode: CombatMode,
  availablePotions: CombatPotion[],
  potionsConsumed: PotionConsumed[],
  perActionScaling?: PerActionScaling,
): void {
  const hitOverride = isAttacker ? interaction.attackerHitOverride : interaction.defenderHitOverride;
  const interactionDamageMultiplier = isAttacker ? interaction.attackerDamageMultiplier : interaction.defenderDamageMultiplier;
  // Damage reduction applies when this actor is being attacked (the opponent's reduction on us).
  // `attackerDamageReduction` means "reduction applied to A when A takes damage".
  // So when A is executing their offensive action against B, B's `defenderDamageReduction` applies.
  const damageReduction = isAttacker ? interaction.defenderDamageReduction : interaction.attackerDamageReduction;

  if (actorKey === 'combatantA' && perActionScaling) {
    const cost = action.cost.stamina + action.cost.mana;
    if (cost > 0) {
      const resolved = resolveScalingStat(
        action.scalingStat ?? 'weapon',
        perActionScaling.weaponRequiredSkill,
        perActionScaling.skillLevels,
      );
      state.resourceCostByScalingStat[resolved] += cost;
    }
  }

  if (action.category === 'offensive') {
    executeOffensiveAction(
      state,
      actorKey,
      actorStats,
      targetStats,
      action,
      hitOverride,
      interactionDamageMultiplier,
      damageReduction,
      actorName,
      targetName,
      ctx,
      combatMode,
      perActionScaling,
    );
    return;
  }

  if (action.category === 'supportive' || action.effect || action.healFlat || action.healPercent) {
    executeSupportiveAction(
      state,
      actorKey,
      actorStats,
      action,
      actorName,
      ctx,
      availablePotions,
      potionsConsumed,
    );
    return;
  }

  executeDefensiveAction(state, actorKey, action, actorName, ctx);
}

export function describeInteraction(interaction: RoundInteraction): string {
  const parts: string[] = [];
  if (interaction.attackerHitOverride === 'guaranteed_miss') {
    parts.push('A blocked');
  }
  if (interaction.defenderHitOverride === 'guaranteed_miss') {
    parts.push('B blocked');
  }
  if (interaction.attackerDamageMultiplier > 1) {
    parts.push('A channeling bonus');
  }
  if (interaction.defenderDamageMultiplier > 1) {
    parts.push('B channeling bonus');
  }
  if (interaction.attackerDamageReduction > 0) {
    parts.push('A defending');
  }
  if (interaction.defenderDamageReduction > 0) {
    parts.push('B defending');
  }
  return parts.length > 0 ? parts.join(', ') : 'normal';
}
