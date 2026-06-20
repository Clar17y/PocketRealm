import type {
  ActionDefinition,
  ActiveEffect,
  BossActiveEffect,
  CombatTemplateSlotData,
  ExhaustedActionReason,
} from '@pocketrealm/shared';
import { resolveAction } from './actionResolver';
import {
  addHealThreat,
  type ThreatEntry,
} from './threatSystem';

// ---------------------------------------------------------------------------
// Shared mutable-state shapes used by both bossRoundResolver and raidRoundResolver
// ---------------------------------------------------------------------------

/** Minimal participant input needed by all three helpers. */
export interface CombatParticipantInput {
  playerId: string;
  template: CombatTemplateSlotData[] | { actionId: string; condition?: unknown; thenActionId?: string; sortOrder: number }[];
  actionDefinitions: Record<string, unknown>;
  maxHp: number;
  maxStamina: number;
  maxMana: number;
  staminaRegenPerRound: number;
  manaRegenPerRound: number;
  healTargetPlayerId?: string | null;
  /** Active effects on this participant — used for condition evaluation in template slots. */
  activeEffects?: readonly BossActiveEffect[];
}

/** Minimal per-round mutable state used by all three helpers. */
export interface CombatParticipantState {
  playerId: string;
  hp: number;
  stamina: number;
  mana: number;
  templateRound: number;
  healingDone: number;
  actionId: string;
  wasExhausted: boolean;
  actionDef: ActionDefinition | null;
  intendedActionId?: string | null;
  intendedActionDef?: ActionDefinition | null;
  exhaustedReason?: ExhaustedActionReason | null;
  healTargetPlayerId?: string | null;
  alternateActionDef?: ActionDefinition | null;
}

// ---------------------------------------------------------------------------
// 1. Resolve participant actions from templates
// ---------------------------------------------------------------------------

/**
 * For each alive participant, pick the action from their combat template
 * based on current round/resources. Mutates `pState[i].actionId`,
 * `.wasExhausted`, and `.actionDef` in place.
 */
export function resolveParticipantActions(
  participants: CombatParticipantInput[],
  pState: CombatParticipantState[],
): void {
  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const s = pState[i];
    if (s.hp <= 0) continue;

    // Normalise template slots to CombatTemplateSlotData shape
    const slots: CombatTemplateSlotData[] = p.template.map((t, idx) => {
      if ('id' in t) return t as CombatTemplateSlotData;
      return {
        id: `slot-${(t as { sortOrder: number }).sortOrder ?? idx}`,
        sortOrder: (t as { sortOrder: number }).sortOrder ?? idx,
        actionId: (t as { actionId: string }).actionId,
        condition: (t as { condition?: unknown }).condition as CombatTemplateSlotData['condition'],
        thenActionId: (t as { thenActionId?: string }).thenActionId,
      };
    });

    // Convert BossActiveEffect[] to ActiveEffect[] for condition evaluation.
    // BossActiveEffect lacks the `target` field; we set it to 'combatantA' to
    // match the actorKey passed to resolveAction (each participant is evaluated
    // independently, so their own effects always target them).
    const activeEffects: ActiveEffect[] = (p.activeEffects ?? []).map(e => ({
      name: e.name,
      target: 'combatantA' as const,
      stat: e.stat,
      modifier: e.modifier,
      remainingRounds: e.roundsRemaining,
      resolvedDamagePerRound: e.damagePerRound,
      dotDamageType: e.dotDamageType,
    }));

    const resolved = resolveAction(
      slots,
      s.templateRound,
      s.hp,
      p.maxHp,
      s.stamina,
      p.maxStamina,
      s.mana,
      p.maxMana,
      activeEffects,
      'combatantA',
      p.actionDefinitions as Record<string, ActionDefinition>,
    );
    s.actionId = resolved.action.id;
    s.wasExhausted = resolved.wasExhausted;
    s.actionDef = resolved.action;
    s.intendedActionId = resolved.intendedActionId ?? resolved.action.id;
    s.intendedActionDef = resolved.intendedAction ?? resolved.action;
    s.exhaustedReason = resolved.exhaustedReason ?? null;
    s.alternateActionDef = resolved.alternateAction ?? null;
  }
}

// ---------------------------------------------------------------------------
// 2. Resolve supportive actions (heal_self / heal_ally)
// ---------------------------------------------------------------------------

/**
 * Process heal_self and heal_ally for all alive participants.
 * Mutates `pState[i].hp` and `.healingDone` in place.
 */
export function resolveSupportiveActions(
  participants: CombatParticipantInput[],
  pState: CombatParticipantState[],
  threatTable: ThreatEntry[],
): void {
  const alivePlayerIds = new Set(pState.filter(s => s.hp > 0).map(s => s.playerId));

  for (let i = 0; i < participants.length; i++) {
    const p = participants[i];
    const s = pState[i];
    const def = s.actionDef;
    if (s.hp <= 0) continue;
    if (!def || def.category !== 'supportive') continue;

    // heal_self
    if (def.actionType === 'heal_self') {
      const healAmount = (def.healFlat ?? 0) + Math.floor((def.healPercent ?? 0) * p.maxHp);
      const actualHeal = Math.min(healAmount, p.maxHp - s.hp);
      s.hp += actualHeal;
      s.healingDone = actualHeal;
      addHealThreat(threatTable, s.playerId, actualHeal);
    }

    // heal_ally — use manual target if set, else lowest HP player
    if (def.actionType === 'heal_ally') {
      const manualTarget = p.healTargetPlayerId;
      let targetId: string | null = null;

      if (manualTarget && alivePlayerIds.has(manualTarget)) {
        targetId = manualTarget;
      } else {
        let lowestHp = Infinity;
        for (const ps of pState) {
          if (ps.hp <= 0 || ps.playerId === s.playerId) continue;
          if (ps.hp < lowestHp) {
            lowestHp = ps.hp;
            targetId = ps.playerId;
          }
        }
        if (!targetId) targetId = s.playerId;
      }

      const healAmount = (def.healFlat ?? 0) + Math.floor((def.healPercent ?? 0) * p.maxHp);
      const targetState = pState.find(ps => ps.playerId === targetId);
      const targetParticipant = participants.find(pp => pp.playerId === targetId);
      if (targetState && targetParticipant) {
        const actualHeal = Math.min(healAmount, targetParticipant.maxHp - targetState.hp);
        targetState.hp += actualHeal;
        s.healingDone = actualHeal;
        s.healTargetPlayerId = targetId;
        addHealThreat(threatTable, s.playerId, actualHeal);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Sum stat modifiers from active effects
// ---------------------------------------------------------------------------

/**
 * Return the effective value of a stat after applying active effect modifiers.
 * Result is floored at 0.
 */
export function getEffectiveStatValue(
  baseStat: number,
  effects: BossActiveEffect[],
  statName: string,
): number {
  const modifier = effects
    .filter(e => e.stat === statName && e.roundsRemaining > 0)
    .reduce((sum, e) => sum + e.modifier, 0);
  return Math.max(0, baseStat + modifier);
}

// ---------------------------------------------------------------------------
// 4. Resolve player buff actions (self-buff + group rally)
// ---------------------------------------------------------------------------

export interface BuffResult {
  participantIndex: number;
  effect: BossActiveEffect;
}

/**
 * Collect buff effects from players using buff-type actions.
 * Returns a flat list of (participantIndex, effect) pairs — does NOT
 * mutate input. Callers merge these into their effect assembly phase.
 */
export function resolvePlayerBuffActions(
  pState: CombatParticipantState[],
): BuffResult[] {
  const results: BuffResult[] = [];
  for (let i = 0; i < pState.length; i++) {
    const s = pState[i];
    if (s.hp <= 0) continue;
    const def = s.actionDef;
    if (!def || def.actionType !== 'buff' || !def.effect) continue;

    const effect: BossActiveEffect = {
      name: def.effect.name,
      stat: def.effect.stat,
      modifier: def.effect.modifier,
      roundsRemaining: def.effect.duration,
    };
    const isGroupBuff = s.actionId === 'rally';

    if (isGroupBuff) {
      for (let j = 0; j < pState.length; j++) {
        if (pState[j].hp <= 0) continue;
        results.push({ participantIndex: j, effect: { ...effect } });
      }
    } else {
      results.push({ participantIndex: i, effect });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 5. Apply resource costs (stamina/mana deduction + regen + template advance)
// ---------------------------------------------------------------------------

/**
 * Deduct action costs, apply per-round regen, and advance template round.
 * Mutates `pState[i].stamina`, `.mana`, and `.templateRound` in place.
 */
export function applyResourceCosts(
  participants: CombatParticipantInput[],
  pState: CombatParticipantState[],
): void {
  for (let i = 0; i < pState.length; i++) {
    const s = pState[i];
    const p = participants[i];
    const def = s.actionDef;

    // Deduct action cost
    if (def && !s.wasExhausted && def.potionType !== 'stamina') {
      s.stamina -= def.cost.stamina;
      s.mana -= def.cost.mana;
    }

    // Regen
    s.stamina = Math.min(p.maxStamina, s.stamina + p.staminaRegenPerRound);
    s.mana = Math.min(p.maxMana, s.mana + p.manaRegenPerRound);

    // Advance template round
    s.templateRound += 1;
  }
}
