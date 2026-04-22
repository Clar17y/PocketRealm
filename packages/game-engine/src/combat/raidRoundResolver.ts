import type {
  ActionDefinition,
  BossActiveEffect,
  RaidRoundInput,
  RaidParticipantResult,
  MobActionResult,
  RaidRoundResult,
  ExpeditionMobState,
  ExhaustedActionEntry,
  DefensiveActionEntry,
  PlayerRoundActionEntry,
  HealingEntry,
  MobTelegraphEntry,
  EffectTickEntry,
  ExpeditionRoundLog,
  CombatPotion,
  PotionConsumed,
} from '@pocketrealm/shared';
import { COMBAT_CONSTANTS, COMBAT_ACTION_CONSTANTS, BOSS_ACTION_DEFINITIONS, mobDisplayName } from '@pocketrealm/shared';
import type { CombatParticipantState } from './combatHelpers';
import {
  resolveParticipantActions,
  resolveSupportiveActions,
  resolvePlayerBuffActions,
} from './combatHelpers';
import {
  applyTaunt,
} from './threatSystem';
import {
  rollDamage as defaultRollDamage,
  isCriticalHit as defaultIsCriticalHit,
} from './damageCalculator';
import type { CombatMode } from '@pocketrealm/shared';
import {
  checkPhaseTransition,
  actionLabel,
  resolvePlayerOffensive,
} from './raidPlayerPhase';
import type { OffensiveAttackContext } from './raidPlayerPhase';
import { resolveRaidOutcomePhases } from './raidRoundResolver/outcomePhases';

// --- RNG Interface ---
// Defined in raidPlayerPhase to avoid circular imports; re-exported here for API consumers.
export type { RaidRoundRng } from './raidPlayerPhase';
import type { RaidRoundRng } from './raidPlayerPhase';

// --- Resolver ---

export function resolveRaidRound(
  input: RaidRoundInput,
  rng?: RaidRoundRng,
  combatMode: CombatMode = 'pve_expedition',
): RaidRoundResult {
  const roll = rng ?? {
    rollHitChance: () => Math.random(),
    rollDamage: defaultRollDamage,
    rollCrit: defaultIsCriticalHit,
  };

  // Username lookup from participants
  const usernameMap = new Map<string, string>();
  for (const p of input.participants) {
    usernameMap.set(p.playerId, p.username ?? p.playerId.slice(0, 8));
  }
  const getUsername = (id: string) => usernameMap.get(id) ?? id.slice(0, 8);

  // Mutable copies of mob state
  const mobState = input.mobs.map(m => ({
    ...m,
    hp: m.hp,
    activeEffects: [...m.activeEffects],
  }));

  // Track original mob count (before summons) for kill counting
  const originalMobCount = mobState.filter(m => m.hp > 0).length;

  // Collect spawned mobs separately so they don't act in the round they're summoned
  const spawnedThisRound: ExpeditionMobState[] = [];

  // Merge boss action definitions for mob lookups
  const mobActionDefs: Record<string, ActionDefinition> = { ...BOSS_ACTION_DEFINITIONS };

  // Player action definitions (from first participant, all share the same pool)
  const playerActionDefs = (input.participants[0]?.actionDefinitions ?? {}) as Record<string, ActionDefinition>;

  // Mutable copies of participant state
  const pState = input.participants.map(p => ({
    playerId: p.playerId,
    hp: p.hp,
    stamina: p.stamina,
    mana: p.mana,
    templateRound: p.templateRound,
    damageDealt: 0,
    healingDone: 0,
    damageTaken: 0,
    actionId: 'defend',
    wasExhausted: false,
    hit: false,
    isCritical: false,
    targetMobId: null as string | null,
    actionDef: null as ActionDefinition | null,
    intendedActionId: null as string | null,
    intendedActionDef: null as ActionDefinition | null,
    exhaustedReason: null as import('@pocketrealm/shared').ExhaustedActionReason | null,
    healTargetPlayerId: null as string | null,
    alternateActionDef: null as ActionDefinition | null,
  }));

  // Round log collectors
  const logPlayerAttacks: PlayerRoundActionEntry[] = [];
  const logDefences: DefensiveActionEntry[] = [];
  const logHealing: HealingEntry[] = [];

  // --- Step 1: Pick actions for all alive participants ---
  resolveParticipantActions(input.participants, pState);

  // --- Step 1b: Rooted/feared override — force defend ---
  for (const s of pState) {
    if (s.hp <= 0) continue;
    const isRooted = input.participants[pState.indexOf(s)]?.activeEffects?.some(
      e => e.stat === 'rooted' && e.roundsRemaining > 0,
    );
    if (isRooted) {
      const defendDef = playerActionDefs['defend'];
      if (defendDef) {
        s.actionId = 'defend';
        s.actionDef = defendDef;
        s.wasExhausted = false;
      }
    }
  }

  // --- Step 2: Apply taunts ---
  for (const s of pState) {
    if (s.hp <= 0 || !s.wasExhausted || !s.exhaustedReason || !s.intendedActionId) continue;

    const exhaustedEntry: ExhaustedActionEntry = {
      entryType: 'exhausted',
      playerId: s.playerId,
      username: getUsername(s.playerId),
      intendedActionId: s.intendedActionId,
      intendedActionLabel: actionLabel(s.intendedActionId, playerActionDefs),
      fallbackActionId: s.actionId,
      fallbackActionLabel: actionLabel(s.actionId, playerActionDefs),
      reason: s.exhaustedReason,
    };
    logPlayerAttacks.push(exhaustedEntry);
  }

  for (const s of pState) {
    if (s.hp <= 0) continue;
    if (s.actionDef?.tauntDuration && s.actionDef.tauntDuration > 0) {
      applyTaunt(input.threatTable, s.playerId, s.actionDef.tauntDuration);
    }
  }

  // --- Step 3: Record defensive stances ---
  const defStances = new Map<string, {
    avoidsPhysical: boolean;
    resistsMagic: boolean;
    damageReductionPercent: number;
    isChanneling: boolean;
  }>();
  for (const s of pState) {
    const def = s.actionDef;
    defStances.set(s.playerId, {
      avoidsPhysical: def?.avoidsPhysical ?? false,
      resistsMagic: def?.resistsMagic ?? false,
      damageReductionPercent: def?.damageReductionPercent ?? 0,
      isChanneling: def?.isChanneling ?? false,
    });
  }

  // Log defensive actions (non-exhausted participants using defensive category)
  for (const s of pState) {
    if (s.hp <= 0 || s.wasExhausted) continue;
    const def = s.actionDef;
    if (!def || def.category !== 'defensive') continue;
    logDefences.push({
      entryType: 'defensive',
      playerId: s.playerId,
      username: getUsername(s.playerId),
      actionId: s.actionId,
      actionLabel: actionLabel(s.actionId, playerActionDefs),
    });
  }

  // --- Step 4: Player offensive phase ---
  const offensiveCtx: OffensiveAttackContext = { combatMode, roll, mobState, playerActionDefs, getUsername, splashCascade: input.splashCascade };

  for (let i = 0; i < input.participants.length; i++) {
    const p = input.participants[i];
    const s = pState[i];
    const def = s.actionDef;
    if (s.hp <= 0) continue;
    if (!def || def.category !== 'offensive' || (def.damageMultiplier ?? 0) <= 0) continue;

    const entries = resolvePlayerOffensive(p, s, def, input.threatTable, offensiveCtx);
    logPlayerAttacks.push(...entries);
  }

  // --- Step 4b: Phase transitions ---
  for (const mob of mobState) {
    if (mob.hp > 0) checkPhaseTransition(mob);
  }

  // --- Step 5: Player supportive phase ---
  resolveSupportiveActions(input.participants, pState, input.threatTable);

  for (let i = 0; i < pState.length; i++) {
    const s = pState[i];
    const def = s.actionDef;
    if (!def || def.category !== 'supportive') continue;
    if (s.healingDone <= 0) continue;

    const healTargetId = (def.actionType === 'heal_ally' && s.healTargetPlayerId)
      ? s.healTargetPlayerId
      : s.playerId;

    logHealing.push({
      playerId: s.playerId,
      username: getUsername(s.playerId),
      actionLabel: actionLabel(s.actionId, playerActionDefs),
      amountHealed: s.healingDone,
      targetPlayerId: healTargetId,
      targetUsername: getUsername(healTargetId),
    });
  }

  // --- Step 5a: Player buff actions (self-buff + group rally) ---
  // Collect into side-map (not mutating input) — merged in effect assembly
  const buffActionResults: Map<number, BossActiveEffect[]> = new Map();
  for (const { participantIndex, effect } of resolvePlayerBuffActions(pState)) {
    if (!buffActionResults.has(participantIndex)) buffActionResults.set(participantIndex, []);
    buffActionResults.get(participantIndex)!.push(effect);
  }
  for (const s of pState) {
    if (s.hp <= 0) continue;
    const def = s.actionDef;
    if (!def || def.actionType !== 'buff' || !def.effect) continue;
    logHealing.push({
      playerId: s.playerId,
      username: getUsername(s.playerId),
      actionLabel: actionLabel(s.actionId, playerActionDefs),
      amountHealed: 0,
      targetPlayerId: s.playerId,
      targetUsername: getUsername(s.playerId),
    });
  }

  return resolveRaidOutcomePhases({
    input,
    pState,
    logPlayerAttacks,
    logDefences,
    logHealing,
    offensiveCtx,
    playerActionDefs,
    getUsername,
    defStances,
    mobState,
    spawnedThisRound,
    buffActionResults,
    roll,
    combatMode,
    originalMobCount,
    mobActionDefs,
  });
}
