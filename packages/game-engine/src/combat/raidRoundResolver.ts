import type {
  ActionDefinition,
  BossActiveEffect,
  RaidRoundInput,
  RaidParticipant,
  RaidParticipantResult,
  RaidThreatEntry,
  MobActionResult,
  RaidRoundResult,
  ExpeditionMobState,
  PlayerAttackEntry,
  ExhaustedActionEntry,
  DefensiveActionEntry,
  PlayerRoundActionEntry,
  MobActionLogEntry,
  HealingEntry,
  MobTelegraphEntry,
  EffectTickEntry,
  ExpeditionRoundLog,
  CombatantStats,
  CombatPotion,
  PotionConsumed,
} from '@pocketrealm/shared';
import { COMBAT_CONSTANTS, COMBAT_ACTION_CONSTANTS, EXPEDITION_CONSTANTS, BOSS_ACTION_DEFINITIONS, mobDisplayName } from '@pocketrealm/shared';
import type { CombatParticipantState } from './combatHelpers';
import {
  resolveParticipantActions,
  resolveSupportiveActions,
  applyResourceCosts,
  getEffectiveStatValue,
  resolvePlayerBuffActions,
} from './combatHelpers';
import {
  addDamageThreat,
  applyTaunt,
  getSingleTarget,
  tickTaunts,
} from './threatSystem';
import {
  rollDamage as defaultRollDamage,
  isCriticalHit as defaultIsCriticalHit,
  resolveHitCheck,
  guaranteedHitResult,
  calculateAvoidScore,
  calculateFinalDamage,
} from './damageCalculator';
import type { HitResolution } from './damageCalculator';
import type { CombatMode } from '@pocketrealm/shared';

// --- RNG Interface ---

export interface RaidRoundRng {
  /** Returns a 0-1 float used as the hit roll against the computed hit probability. */
  rollHitChance: () => number;
  rollDamage: (min: number, max: number) => number;
  rollCrit: (chance: number) => boolean;
}

// AoE player actions — these target all surviving mobs instead of one
const AOE_ACTION_IDS = new Set([
  'cleave', 'scatter_shot', 'volley', 'frost_nova', 'blizzard', 'whirlwind', 'meteor_strike',
]);

// --- Phase Transition ---

function checkPhaseTransition(mob: ExpeditionMobState): void {
  if (!mob.phaseTemplates || mob.phaseTemplates.length === 0) return;
  for (const phase of mob.phaseTemplates) {
    if (mob.hp <= mob.maxHp * phase.hpThreshold && mob.actionTemplate !== phase.template) {
      mob.actionTemplate = phase.template;
      break;
    }
  }
}

function actionLabel(actionId: string, defs: Record<string, ActionDefinition>): string {
  return defs[actionId]?.name ?? actionId.replace(/_/g, ' ');
}

// --- Shared offensive attack resolution ---

interface OffensiveAttackContext {
  combatMode: CombatMode;
  roll: RaidRoundRng;
  mobState: { id: string; hp: number; maxHp: number; stats: CombatantStats; activeEffects: BossActiveEffect[]; name: string; prefix: string | null }[];
  playerActionDefs: Record<string, ActionDefinition>;
  getUsername: (id: string) => string;
  splashCascade?: boolean;
}

/**
 * Resolve a player's offensive attack against mobs. Handles target selection,
 * hit resolution, damage, debuff/DoT application, and log generation.
 * Used by both Step 4 (primary offensive) and Step 5c (potion fallback).
 */
function resolvePlayerOffensive(
  p: RaidParticipant,
  s: CombatParticipantState & { hit: boolean; isCritical: boolean; targetMobId: string | null; damageDealt: number },
  def: ActionDefinition,
  threatTable: RaidThreatEntry[],
  ctx: OffensiveAttackContext,
): PlayerAttackEntry[] {
  const entries: PlayerAttackEntry[] = [];
  const aliveMobs = ctx.mobState.filter(m => m.hp > 0);
  if (aliveMobs.length === 0) return entries;

  const isAoe = AOE_ACTION_IDS.has(s.actionId);
  let targets: typeof aliveMobs;
  if (isAoe) {
    targets = aliveMobs;
  } else if (p.targetMobId) {
    const preferred = aliveMobs.find(m => m.id === p.targetMobId);
    targets = [preferred ?? aliveMobs.reduce((lowest, m) => m.hp < lowest.hp ? m : lowest)];
  } else {
    targets = [aliveMobs.reduce((lowest, m) => m.hp < lowest.hp ? m : lowest)];
  }

  s.targetMobId = isAoe ? null : targets[0].id;

  let totalDamageDealt = 0;
  const effectiveAccuracy = getEffectiveStatValue(p.stats.accuracy, p.activeEffects, 'accuracy');
  const hitScore = effectiveAccuracy + (def.accuracyModifier ?? 0);

  for (const target of targets) {
    const avoidScore = calculateAvoidScore(target.stats);
    const hitResolution = def.alwaysHits
      ? guaranteedHitResult(hitScore, avoidScore)
      : resolveHitCheck({
          combatMode: ctx.combatMode,
          hitScore,
          avoidScore,
          hitRollValue: ctx.roll.rollHitChance(),
        });

    const hits = hitResolution.didHit;
    const baseEntry = {
      entryType: 'attack' as const,
      playerId: p.playerId,
      username: ctx.getUsername(p.playerId),
      actionId: s.actionId,
      actionLabel: actionLabel(s.actionId, ctx.playerActionDefs),
      targetMobId: target.id,
      targetMobName: mobDisplayName(target),
      hitChance: hitResolution.hitChance,
      hitRollValue: hitResolution.hitRollValue,
      attackerHitScore: hitResolution.hitScore,
      defenderAvoidScore: hitResolution.avoidScore,
      staminaCost: def.cost.stamina,
      manaCost: def.cost.mana,
    };

    if (!hits) {
      if (def.effect?.alwaysApplies && def.effect.isDebuff && target.hp > 0) {
        target.activeEffects.push({
          name: def.effect.name,
          stat: def.effect.stat,
          modifier: def.effect.modifier,
          roundsRemaining: def.effect.duration,
        });
      }

      // Splash hit cascade: on miss, try other alive mobs in order
      if (ctx.splashCascade && !isAoe) {
        const otherMobs = aliveMobs.filter(m => m.id !== target.id && m.hp > 0);
        const cascadeAttempts: import('@pocketrealm/shared').SplashCascadeAttempt[] = [];
        let cascadeTarget: typeof target | null = null;
        for (const candidateMob of otherMobs) {
          const cascadeAvoid = calculateAvoidScore(candidateMob.stats);
          const cascadeResult = def.alwaysHits
            ? guaranteedHitResult(hitScore, cascadeAvoid)
            : resolveHitCheck({
                combatMode: ctx.combatMode,
                hitScore,
                avoidScore: cascadeAvoid,
                hitRollValue: ctx.roll.rollHitChance(),
              });
          if (cascadeResult.didHit) {
            cascadeTarget = candidateMob;
            // Cascade hit: compute damage against cascade target
            s.hit = true;
            const rawDmg = ctx.roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
            const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
            const crit = ctx.roll.rollCrit(p.stats.critChance ?? 0);
            if (crit) s.isCritical = true;
            const isMagicAttack = def.damageType === 'magic' || p.stats.damageType === 'magic';
            const effectiveDefence = isMagicAttack
              ? getEffectiveStatValue(candidateMob.stats.magicDefence, candidateMob.activeEffects, 'magicDefence')
              : getEffectiveStatValue(candidateMob.stats.defence, candidateMob.activeEffects, 'defence');
            const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);
            candidateMob.hp = Math.max(0, candidateMob.hp - damage);
            totalDamageDealt += damage;
            if (def.effect?.isDebuff && candidateMob.hp > 0) {
              const dotFlat = def.effect.damagePerRound ?? 0;
              const dotPct = def.effect.damagePerRoundPercent ?? 0;
              const resolvedDot = dotFlat + Math.floor((dotPct / 100) * damage);
              candidateMob.activeEffects.push({
                name: def.effect.name,
                stat: def.effect.stat,
                modifier: def.effect.modifier,
                roundsRemaining: def.effect.duration,
                ...(resolvedDot > 0 ? { damagePerRound: resolvedDot, dotDamageType: def.effect.dotDamageType } : {}),
              });
            }
            cascadeAttempts.push({
              targetMobName: mobDisplayName(candidateMob),
              hitChance: cascadeResult.hitChance,
              hitRollValue: cascadeResult.hitRollValue,
              attackerHitScore: cascadeResult.hitScore,
              defenderAvoidScore: cascadeAvoid,
              hit: true,
              crit,
              damageRoll: rawDmg,
              totalDamage: damage,
            });
            break;
          } else {
            cascadeAttempts.push({
              targetMobName: mobDisplayName(candidateMob),
              hitChance: cascadeResult.hitChance,
              hitRollValue: cascadeResult.hitRollValue,
              attackerHitScore: cascadeResult.hitScore,
              defenderAvoidScore: cascadeAvoid,
              hit: false,
            });
          }
        }
        // Log entry shows original miss + cascade chain
        entries.push({
          ...baseEntry,
          hit: !!cascadeTarget,
          crit: cascadeTarget ? cascadeAttempts[cascadeAttempts.length - 1]?.crit ?? false : false,
          ...(cascadeTarget ? {
            damageRoll: cascadeAttempts[cascadeAttempts.length - 1]?.damageRoll,
            totalDamage: cascadeAttempts[cascadeAttempts.length - 1]?.totalDamage,
          } : {}),
          splashCascade: cascadeAttempts,
        });
        continue;
      }

      entries.push({ ...baseEntry, hit: false, crit: false });
      continue;
    }

    s.hit = true;
    const rawDmg = ctx.roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
    const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
    const crit = ctx.roll.rollCrit(p.stats.critChance ?? 0);
    if (crit) s.isCritical = true;

    const isMagicAttack = def.damageType === 'magic' || p.stats.damageType === 'magic';
    const effectiveDefence = isMagicAttack
      ? getEffectiveStatValue(target.stats.magicDefence, target.activeEffects, 'magicDefence')
      : getEffectiveStatValue(target.stats.defence, target.activeEffects, 'defence');
    const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);

    target.hp = Math.max(0, target.hp - damage);
    totalDamageDealt += damage;

    if (def.effect?.isDebuff && target.hp > 0) {
      const dotFlat = def.effect.damagePerRound ?? 0;
      const dotPct = def.effect.damagePerRoundPercent ?? 0;
      const resolvedDot = dotFlat + Math.floor((dotPct / 100) * damage);
      target.activeEffects.push({
        name: def.effect.name,
        stat: def.effect.stat,
        modifier: def.effect.modifier,
        roundsRemaining: def.effect.duration,
        ...(resolvedDot > 0 ? { damagePerRound: resolvedDot, dotDamageType: def.effect.dotDamageType } : {}),
      });
    }

    entries.push({ ...baseEntry, hit: true, crit, damageRoll: rawDmg, totalDamage: damage });
  }

  s.damageDealt = totalDamageDealt;
  if (totalDamageDealt > 0) {
    addDamageThreat(threatTable, s.playerId, totalDamageDealt);
  }

  return entries;
}

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
  const logMobActions: MobActionLogEntry[] = [];
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

  // --- Step 5b: Potion actions ---
  const allPotionsConsumed: PotionConsumed[] = [];
  const perParticipantPotions: Map<number, PotionConsumed[]> = new Map();
  const potionSicknessToApply: { participantIndex: number }[] = [];
  // Track consumed potion indices per participant to avoid mutating input
  const consumedPotionIndices: Map<number, Set<number>> = new Map();
  // Cleanse results: debuffs and DoTs to remove per participant (applied in effect assembly)
  const cleanseResults: Map<number, { debuffNames: Set<string>; dotNamesToRemove: Set<string> }> = new Map();
  // Buff potion results: buff effects to apply per participant (applied in effect assembly)
  const buffPotionResults: Map<number, BossActiveEffect[]> = new Map();

  // Participants whose potion action failed and should fall back to alternate action
  const potionFallbackIndices: number[] = [];

  for (let i = 0; i < pState.length; i++) {
    const s = pState[i];
    const p = input.participants[i];
    const def = s.actionDef;
    if (s.hp <= 0) continue;
    if (!def) continue;

    const isPotionAction = def.actionType === 'use_potion'
      || def.actionType === 'use_cleanse_potion'
      || def.actionType === 'use_buff_potion';
    if (!isPotionAction) continue;

    // Check potion sickness — fall back to alternate action (else branch)
    const hasSickness = (p.activeEffects ?? []).some(
      (e: { stat: string }) => e.stat === 'potionSickness',
    );
    if (hasSickness) {
      if (s.alternateActionDef) potionFallbackIndices.push(i);
      continue;
    }

    const potions = p.availablePotions ?? [];
    const usedIndices = consumedPotionIndices.get(i);

    // --- Resource potions (hp/stamina/mana) ---
    if (def.actionType === 'use_potion') {
      const potionType = def.potionType ?? 'hp';
      const potionIndex = potions.findIndex((pt: CombatPotion, idx: number) =>
        pt.potionType === potionType && (!usedIndices || !usedIndices.has(idx)),
      );
      if (potionIndex === -1) {
        if (s.alternateActionDef) potionFallbackIndices.push(i);
        continue;
      }

      const potion = potions[potionIndex];
      let actualRestore = 0;

      if (potionType === 'hp') {
        actualRestore = Math.min(potion.healAmount, p.maxHp - s.hp);
        s.hp += actualRestore;
        s.healingDone = actualRestore;
      } else if (potionType === 'stamina') {
        actualRestore = Math.min(potion.healAmount, p.maxStamina - s.stamina);
        s.stamina += actualRestore;
      } else {
        actualRestore = Math.min(potion.healAmount, p.maxMana - s.mana);
        s.mana += actualRestore;
      }

      if (!consumedPotionIndices.has(i)) consumedPotionIndices.set(i, new Set());
      consumedPotionIndices.get(i)!.add(potionIndex);
      const consumed: PotionConsumed = { templateId: potion.templateId, name: potion.name, healAmount: actualRestore, round: input.roundNumber };
      allPotionsConsumed.push(consumed);
      if (!perParticipantPotions.has(i)) perParticipantPotions.set(i, []);
      perParticipantPotions.get(i)!.push(consumed);
      potionSicknessToApply.push({ participantIndex: i });

      if (potionType === 'hp' && actualRestore > 0) {
        logHealing.push({
          playerId: s.playerId,
          username: getUsername(s.playerId),
          actionLabel: potion.name,
          amountHealed: actualRestore,
          targetPlayerId: s.playerId,
          targetUsername: getUsername(s.playerId),
        });
      }
      continue;
    }

    // --- Cleanse potion ---
    if (def.actionType === 'use_cleanse_potion') {
      const potionIndex = potions.findIndex((pt: CombatPotion, idx: number) =>
        pt.potionType === 'cleanse' && (!usedIndices || !usedIndices.has(idx)),
      );
      if (potionIndex === -1) {
        if (s.alternateActionDef) potionFallbackIndices.push(i);
        continue;
      }

      const effects = p.activeEffects ?? [];
      // Find stat debuffs (negative modifier, not potion sickness, no DoT)
      const statDebuffs = effects.filter(
        (e: BossActiveEffect) => e.stat !== 'potionSickness' && e.modifier < 0 && !e.damagePerRound,
      );
      // Find magic DoTs
      const magicDots = effects.filter(
        (e: BossActiveEffect) => e.damagePerRound && e.damagePerRound > 0 && e.dotDamageType === 'magic',
      );
      if (statDebuffs.length === 0 && magicDots.length === 0) {
        if (s.alternateActionDef) potionFallbackIndices.push(i);
        continue;
      }

      const potion = potions[potionIndex];
      const cleansedNames: string[] = [];

      // Remove all stat debuffs
      const debuffNames = new Set(statDebuffs.map((e: BossActiveEffect) => e.name));
      for (const name of debuffNames) {
        const count = statDebuffs.filter((e: BossActiveEffect) => e.name === name).length;
        cleansedNames.push(`${count}x ${name}`);
      }

      // Remove N worst magic DoT groups (N = potion's buffValue, 0 = all)
      const dotGroupsToClear = potion.buffValue ?? 1;
      const dotNamesToRemove = new Set<string>();
      if (magicDots.length > 0) {
        const groups = new Map<string, { totalDmg: number; count: number }>();
        for (const dot of magicDots) {
          const g = groups.get(dot.name) ?? { totalDmg: 0, count: 0 };
          g.totalDmg += dot.damagePerRound!;
          g.count++;
          groups.set(dot.name, g);
        }
        const sorted = [...groups.entries()].sort((a, b) => b[1].totalDmg - a[1].totalDmg);
        const toRemove = dotGroupsToClear === 0 ? sorted : sorted.slice(0, dotGroupsToClear);
        for (const [name, g] of toRemove) {
          dotNamesToRemove.add(name);
          cleansedNames.push(`${g.count}x ${name}`);
        }
      }

      // Build cleansed effect list for this participant (applied in Step 8)
      if (!cleanseResults.has(i)) cleanseResults.set(i, { debuffNames, dotNamesToRemove });

      if (!consumedPotionIndices.has(i)) consumedPotionIndices.set(i, new Set());
      consumedPotionIndices.get(i)!.add(potionIndex);
      const consumed: PotionConsumed = { templateId: potion.templateId, name: potion.name, healAmount: 0, round: input.roundNumber };
      allPotionsConsumed.push(consumed);
      if (!perParticipantPotions.has(i)) perParticipantPotions.set(i, []);
      perParticipantPotions.get(i)!.push(consumed);
      potionSicknessToApply.push({ participantIndex: i });

      logHealing.push({
        playerId: s.playerId,
        username: getUsername(s.playerId),
        actionLabel: `${potion.name} (cleanse ${cleansedNames.join(', ')})`,
        amountHealed: 0,
        targetPlayerId: s.playerId,
        targetUsername: getUsername(s.playerId),
      });
      continue;
    }

    // --- Buff potion (attack / defence) ---
    if (def.actionType === 'use_buff_potion') {
      const potionType = def.potionType as 'buff_attack' | 'buff_defence';
      const potionIndex = potions.findIndex((pt: CombatPotion, idx: number) =>
        pt.potionType === potionType && (!usedIndices || !usedIndices.has(idx)),
      );
      if (potionIndex === -1) {
        if (s.alternateActionDef) potionFallbackIndices.push(i);
        continue;
      }

      const potion = potions[potionIndex];
      const duration = potion.buffDuration ?? 5;
      const value = potion.buffValue ?? 0;

      const buffsToApply: BossActiveEffect[] = [];
      if (potionType === 'buff_attack') {
        buffsToApply.push({
          name: 'Elixir of Power',
          stat: 'attackPercent',
          modifier: value,
          roundsRemaining: duration,
        });
      } else {
        buffsToApply.push({
          name: 'Resist Potion',
          stat: 'defence',
          modifier: value,
          roundsRemaining: duration,
        });
        buffsToApply.push({
          name: 'Resist Potion (Magic)',
          stat: 'magicDefence',
          modifier: value,
          roundsRemaining: duration,
        });
      }

      if (!buffPotionResults.has(i)) buffPotionResults.set(i, []);
      buffPotionResults.get(i)!.push(...buffsToApply);

      if (!consumedPotionIndices.has(i)) consumedPotionIndices.set(i, new Set());
      consumedPotionIndices.get(i)!.add(potionIndex);
      const consumed: PotionConsumed = { templateId: potion.templateId, name: potion.name, healAmount: 0, round: input.roundNumber };
      allPotionsConsumed.push(consumed);
      if (!perParticipantPotions.has(i)) perParticipantPotions.set(i, []);
      perParticipantPotions.get(i)!.push(consumed);
      potionSicknessToApply.push({ participantIndex: i });

      const buffDesc = buffsToApply.map(b => `${b.stat} +${b.modifier} (${b.roundsRemaining} rds)`).join(', ');
      logHealing.push({
        playerId: s.playerId,
        username: getUsername(s.playerId),
        actionLabel: `${potion.name} (${buffDesc})`,
        amountHealed: 0,
        targetPlayerId: s.playerId,
        targetUsername: getUsername(s.playerId),
      });
      continue;
    }
  }


  // --- Step 5c: Potion fallback — run alternate actions for participants whose potion couldn't fire ---
  for (const i of potionFallbackIndices) {
    const s = pState[i];
    const p = input.participants[i];
    const altDef = s.alternateActionDef!;

    // Swap to the alternate action
    s.actionDef = altDef;
    s.actionId = altDef.id;

    // Deduct resource cost and apply regen (matching applyResourceCosts logic)
    s.stamina -= altDef.cost.stamina;
    s.mana -= altDef.cost.mana;
    s.stamina = Math.min(p.maxStamina, s.stamina + p.staminaRegenPerRound);
    s.mana = Math.min(p.maxMana, s.mana + p.manaRegenPerRound);

    // If it's an offensive action, resolve attack against mob (reuses Step 4 helper)
    if (altDef.category === 'offensive' && s.hp > 0) {
      const entries = resolvePlayerOffensive(p, s, altDef, input.threatTable, offensiveCtx);
      logPlayerAttacks.push(...entries);
    } else if (altDef.actionType === 'heal_self' || altDef.actionType === 'heal_ally') {
      // Supportive fallback — run through heal logic then log
      resolveSupportiveActions([p], [s], input.threatTable);
      if (s.healingDone > 0) {
        const healTargetId = (altDef.actionType === 'heal_ally' && s.healTargetPlayerId)
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
    } else if (altDef.category === 'defensive') {
      logDefences.push({
        entryType: 'defensive' as const,
        playerId: p.playerId,
        username: getUsername(p.playerId),
        actionId: altDef.id,
        actionLabel: actionLabel(altDef.id, playerActionDefs),
      });
    }
  }

  // --- Step 6: Mob offensive phase ---
  // Accumulator for new effects applied to players this round by mob actions
  const newPlayerEffects: Map<number, BossActiveEffect[]> = new Map();
  const mobActionResults: MobActionResult[] = [];

  for (const mob of mobState) {
    if (mob.hp <= 0) continue;

    // Pinned mobs skip their attack (forced defend)
    const isPinned = mob.activeEffects.some(
      e => e.stat === 'pinned' && e.roundsRemaining > 0,
    );
    if (isPinned) {
      logMobActions.push({
        mobId: mob.id,
        mobName: mobDisplayName(mob),
        actionId: 'pinned',
        actionLabel: 'Pinned',
        targetMode: 'single_target',
        wasTelegraphed: false,
        targets: [],
      });
      mobActionResults.push({
        mobId: mob.id,
        actionId: 'pinned',
        targetMode: 'single_target',
        targetPlayerIds: [],
        damageDealt: 0,
        healingDone: 0,
      });
      continue;
    }

    const actionIndex = (input.roundNumber - 1) % mob.actionTemplate.length;
    const templateAction = mob.actionTemplate[actionIndex];
    const mActionDef = mobActionDefs[templateAction.actionId];
    if (!mActionDef) continue;

    const mobResult: MobActionResult = {
      mobId: mob.id,
      actionId: templateAction.actionId,
      targetMode: templateAction.targetMode,
      targetPlayerIds: [],
      damageDealt: 0,
      healingDone: 0,
    };

    const mobLogEntry: MobActionLogEntry = {
      mobId: mob.id,
      mobName: mobDisplayName(mob),
      actionId: templateAction.actionId,
      actionLabel: actionLabel(templateAction.actionId, mobActionDefs),
      targetMode: templateAction.targetMode,
      wasTelegraphed: templateAction.isTelegraphed ?? false,
      targets: [],
    };

    // boss_summon_adds: spawn new mobs from the summon pool
    if (templateAction.actionId === 'boss_summon_adds' && input.summonPool && input.summonPool.length > 0) {
      const MAX_TOTAL_SUMMONS = EXPEDITION_CONSTANTS.MAX_TOTAL_SUMMONS;
      const existingSummonCount = mobState.filter(m => m.id.startsWith('mob-summon-')).length + spawnedThisRound.length;
      const remainingBudget = MAX_TOTAL_SUMMONS - existingSummonCount;

      if (remainingBudget > 0) {
        const spawnCount = Math.min(2 + (roll.rollDamage(0, 1) >= 1 ? 1 : 0), remainingBudget); // 2-3 adds, capped
        const mutablePool = [...input.summonPool];
        for (let s = 0; s < spawnCount && mutablePool.length > 0; s++) {
          const poolIndex = roll.rollDamage(0, mutablePool.length - 1);
          const template = mutablePool.splice(poolIndex, 1)[0];
          const spawnedMob: ExpeditionMobState = {
            ...template,
            id: `mob-summon-${input.roundNumber}-${s}`,
            hp: template.maxHp,
            activeEffects: [],
          };
          spawnedThisRound.push(spawnedMob);
        }
      }
      logMobActions.push({
        mobId: mob.id,
        mobName: mobDisplayName(mob),
        actionId: 'boss_summon_adds',
        actionLabel: 'Summon Adds',
        targetMode: 'aoe',
        wasTelegraphed: templateAction.isTelegraphed ?? false,
        targets: [],
      });
      mobActionResults.push({
        mobId: mob.id,
        actionId: 'boss_summon_adds',
        targetMode: 'aoe',
        targetPlayerIds: [],
        damageDealt: 0,
        healingDone: 0,
      });
      continue;
    }

    // Refresh alive set
    const aliveAfterOffensive = new Set(pState.filter(s => s.hp > 0).map(s => s.playerId));
    if (aliveAfterOffensive.size === 0) {
      mobActionResults.push(mobResult);
      logMobActions.push(mobLogEntry);
      continue;
    }

    if (mActionDef.category === 'offensive' || mActionDef.actionType === 'debuff_spell') {
      let targets: string[] = [];
      const currentAggroHolder = getSingleTarget(input.threatTable, aliveAfterOffensive);

      if (templateAction.targetMode === 'single_target') {
        if (currentAggroHolder) targets = [currentAggroHolder];
      } else {
        targets = Array.from(aliveAfterOffensive);
      }

      const isMagic = mActionDef.damageType === 'magic';
      const isPhysical = !isMagic;

      for (const targetId of targets) {
        mobResult.targetPlayerIds.push(targetId);
        const targetState = pState.find(ps => ps.playerId === targetId);
        const targetParticipant = input.participants.find(pp => pp.playerId === targetId);
        if (!targetState || !targetParticipant) continue;

        const targetIdx = pState.findIndex(ps => ps.playerId === targetId);
        const stance = defStances.get(targetId);

        // Compute hit scores for all attacks (needed for log entries)
        const mobHitScore = mob.stats.accuracy + (mActionDef.accuracyModifier ?? 0);
        const playerAvoidScore = calculateAvoidScore(targetParticipant.stats);

        // Counter avoids physical, Ward avoids magic
        const blocked = (stance?.avoidsPhysical && isPhysical) || (stance?.resistsMagic && isMagic);
        if (blocked) {
          mobLogEntry.targets.push({
            playerId: targetId,
            username: getUsername(targetId),
            damageTaken: 0,
            blocked: true,
            dodged: false,
            knockedOut: false,
            mobHitScore,
            playerAvoidScore,
          });
          continue;
        }

        // Hit resolution: normal attacks can be dodged, boss specials (alwaysHits) cannot
        let hitResult: HitResolution | undefined;
        if (!mActionDef.alwaysHits) {
          hitResult = resolveHitCheck({
            combatMode,
            hitScore: mobHitScore,
            avoidScore: playerAvoidScore,
            hitRollValue: roll.rollHitChance(),
          });

          if (!hitResult.didHit) {
            // Apply alwaysApplies effects even on dodge (symmetrical with player miss path)
            if (mActionDef.effect?.alwaysApplies && mActionDef.effect.isDebuff && targetState.hp > 0 && targetIdx >= 0) {
              const newEffect: BossActiveEffect = {
                name: mActionDef.effect.name,
                stat: mActionDef.effect.stat,
                modifier: mActionDef.effect.modifier,
                roundsRemaining: mActionDef.effect.duration,
              };
              if (!newPlayerEffects.has(targetIdx)) newPlayerEffects.set(targetIdx, []);
              newPlayerEffects.get(targetIdx)!.push(newEffect);
            }
            mobLogEntry.targets.push({
              playerId: targetId,
              username: getUsername(targetId),
              damageTaken: 0,
              blocked: false,
              dodged: true,
              knockedOut: false,
              hitChance: hitResult.hitChance,
              hitRollValue: hitResult.hitRollValue,
              mobHitScore,
              playerAvoidScore,
            });
            continue;
          }
        }

        const dmgRaw = roll.rollDamage(mob.stats.damageMin, mob.stats.damageMax);
        // Apply mob attack buffs (rally/frenzy) as flat bonus damage
        const mobAttackBonus = getEffectiveStatValue(0, mob.activeEffects, 'attack');
        let baseDmg = Math.floor(dmgRaw * (mActionDef.damageMultiplier ?? 1.0)) + mobAttackBonus;
        const combinedTargetEffects = [
          ...(targetParticipant.activeEffects ?? []),
          ...(targetIdx >= 0 ? (newPlayerEffects.get(targetIdx) ?? []) : []),
          ...(targetIdx >= 0 ? (buffActionResults.get(targetIdx) ?? []) : []),
        ];

        // Execution strike + marked_for_death combo: 3x damage (before defence)
        if (templateAction.actionId === 'boss_execution_strike') {
          const isMarked = combinedTargetEffects.some(e => e.stat === 'marked_for_death' && e.roundsRemaining > 0);
          if (isMarked) {
            baseDmg *= 3;
          }
        }

        // Nature cursed: magic damage amplified 3x (before defence)
        if (isMagic) {
          const isCursed = combinedTargetEffects.some(
            e => e.stat === 'nature_cursed' && e.roundsRemaining > 0,
          );
          if (isCursed) {
            baseDmg *= 3;
          }
        }

        // Use effect-modified player defence (accounts for wither etc.)
        const effectivePlayerDefence = isMagic
          ? getEffectiveStatValue(targetParticipant.stats.magicDefence, combinedTargetEffects, 'magicDefence')
          : getEffectiveStatValue(targetParticipant.stats.defence, combinedTargetEffects, 'defence');

        let damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, baseDmg - effectivePlayerDefence);

        if (stance?.isChanneling) {
          damage = Math.floor(damage * COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE);
        }

        if (stance?.damageReductionPercent && stance.damageReductionPercent > 0) {
          damage = Math.floor(damage * (1 - stance.damageReductionPercent));
          damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, damage);
        }

        targetState.damageTaken += damage;
        targetState.hp = Math.max(0, targetState.hp - damage);
        mobResult.damageDealt += damage;

        mobLogEntry.targets.push({
          playerId: targetId,
          username: getUsername(targetId),
          damageTaken: damage,
          blocked: false,
          dodged: false,
          knockedOut: targetState.hp <= 0,
          hitChance: hitResult?.hitChance,
          hitRollValue: hitResult?.hitRollValue,
          mobHitScore,
          playerAvoidScore,
          damageRoll: dmgRaw,
        });

        // Apply mob debuff/DoT effects to player on hit
        if (mActionDef.effect?.isDebuff && targetState.hp > 0 && targetIdx >= 0) {
          const newEffect: BossActiveEffect = {
            name: mActionDef.effect.name,
            stat: mActionDef.effect.stat,
            modifier: mActionDef.effect.modifier,
            roundsRemaining: mActionDef.effect.duration,
            ...(mActionDef.effect.damagePerRound ? {
              damagePerRound: mActionDef.effect.damagePerRound,
              dotDamageType: mActionDef.effect.dotDamageType,
            } : {}),
          };
          if (!newPlayerEffects.has(targetIdx)) newPlayerEffects.set(targetIdx, []);
          newPlayerEffects.get(targetIdx)!.push(newEffect);
        }
      }
    }

    // Mob heal_self
    if (mActionDef.actionType === 'heal_self') {
      const healAmount = Math.floor((mActionDef.healPercent ?? 0) * mob.maxHp) + (mActionDef.healFlat ?? 0);
      const actualHeal = Math.min(healAmount, mob.maxHp - mob.hp);
      mob.hp += actualHeal;
      mobResult.healingDone = actualHeal;
    }

    // boss_rally — buff ALL alive mobs, not just self
    if (templateAction.actionId === 'boss_rally' && mActionDef.effect) {
      for (const m of mobState) {
        if (m.hp <= 0) continue;
        m.activeEffects.push({
          name: mActionDef.effect.name,
          stat: mActionDef.effect.stat,
          modifier: mActionDef.effect.modifier,
          roundsRemaining: mActionDef.effect.duration,
        });
      }
      mobActionResults.push(mobResult);
      logMobActions.push(mobLogEntry);
      continue;
    }

    // Mob enrage/buff — applied to the mob itself
    if (mActionDef.actionType === 'buff' && mActionDef.effect) {
      mob.activeEffects.push({
        name: mActionDef.effect.name,
        stat: mActionDef.effect.stat,
        modifier: mActionDef.effect.modifier,
        roundsRemaining: mActionDef.effect.duration,
      });
    }

    mobActionResults.push(mobResult);
    logMobActions.push(mobLogEntry);
  }

  // Push spawned mobs into mobState AFTER the mob loop so they don't act this round
  for (const spawned of spawnedThisRound) {
    mobState.push(spawned);
  }

  // --- Step 7: Environmental DoT ---
  if (input.environmentalDotPercent && input.environmentalDotPercent > 0) {
    for (let i = 0; i < pState.length; i++) {
      const s = pState[i];
      const p = input.participants[i];
      if (s.hp <= 0) continue;

      const dotDamage = Math.floor(input.environmentalDotPercent * p.maxHp);
      s.damageTaken += dotDamage;
      s.hp = Math.max(0, s.hp - dotDamage);
    }
  }

  // --- Step 8: Resource management ---
  applyResourceCosts(input.participants, pState);

  // --- Step 9: Tick effects ---
  const logEffectTicks: EffectTickEntry[] = [];

  // Tick mob effects: apply DoT damage, then decrement duration
  for (const mob of mobState) {
    if (mob.hp <= 0) continue;
    const remaining: BossActiveEffect[] = [];
    for (const effect of mob.activeEffects) {
      if (effect.damagePerRound && effect.damagePerRound > 0 && mob.hp > 0) {
        const defence = effect.dotDamageType === 'physical' ? mob.stats.defence : mob.stats.magicDefence;
        const dotDmg = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, effect.damagePerRound - defence);
        mob.hp = Math.max(0, mob.hp - dotDmg);
        logEffectTicks.push({
          targetType: 'mob',
          targetId: mob.id,
          targetName: mobDisplayName(mob),
          effectName: effect.name,
          damage: dotDmg,
          damageType: effect.dotDamageType ?? 'magic',
          hpAfter: mob.hp,
        });
      }
      effect.roundsRemaining -= 1;
      if (effect.roundsRemaining > 0) {
        remaining.push(effect);
      }
    }
    mob.activeEffects = remaining;
  }

  // Build potion sickness effects per participant (without mutating input)
  const sicknessByParticipant = new Set(potionSicknessToApply.map(p => p.participantIndex));

  const participantEffectsAfter: BossActiveEffect[][] = input.participants.map((p, idx) => {
    let effects = [...(p.activeEffects ?? [])];
    // Merge new effects applied by mob actions this round
    const mobAppliedEffects = newPlayerEffects.get(idx);
    if (mobAppliedEffects) {
      effects.push(...mobAppliedEffects);
    }
    // Merge buff action effects (rally, fortify, etc.)
    const buffEffects = buffActionResults.get(idx);
    if (buffEffects) {
      effects.push(...buffEffects);
    }
    // Apply cleanse: remove stat debuffs and magic DoTs
    const cleanse = cleanseResults.get(idx);
    if (cleanse) {
      effects = effects.filter(e => {
        // Remove stat debuffs by name
        if (cleanse.debuffNames.has(e.name) && e.stat !== 'potionSickness' && e.modifier < 0 && !e.damagePerRound) return false;
        // Remove magic DoTs by name
        if (cleanse.dotNamesToRemove.has(e.name) && e.damagePerRound && e.damagePerRound > 0 && e.dotDamageType === 'magic') return false;
        return true;
      });
    }
    // Apply buff potion effects
    const buffs = buffPotionResults.get(idx);
    if (buffs) {
      effects.push(...buffs);
    }
    // Add potion sickness if this participant consumed a potion
    if (sicknessByParticipant.has(idx)) {
      effects.push({
        name: 'Potion Sickness',
        stat: 'potionSickness',
        modifier: 0,
        roundsRemaining: COMBAT_ACTION_CONSTANTS.POTION_SICKNESS_ROUNDS,
      });
    }
    // Apply DoT damage from player effects, then tick and filter expired
    const remaining: BossActiveEffect[] = [];
    for (const effect of effects) {
      if (effect.damagePerRound && effect.damagePerRound > 0 && pState[idx].hp > 0) {
        const defence = effect.dotDamageType === 'physical'
          ? p.stats.defence
          : p.stats.magicDefence;
        const dotDmg = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, effect.damagePerRound - defence);
        pState[idx].hp = Math.max(0, pState[idx].hp - dotDmg);
        pState[idx].damageTaken += dotDmg;
        logEffectTicks.push({
          targetType: 'player',
          targetId: pState[idx].playerId,
          targetName: getUsername(pState[idx].playerId),
          effectName: effect.name,
          damage: dotDmg,
          damageType: effect.dotDamageType ?? 'magic',
          hpAfter: pState[idx].hp,
        });
      }
      const ticked = { ...effect, roundsRemaining: effect.roundsRemaining - 1 };
      if (ticked.roundsRemaining > 0) {
        remaining.push(ticked);
      }
    }
    return remaining;
  });

  // --- Step 10: Threat decay ---
  tickTaunts(input.threatTable);

  // --- Step 11: Build result ---
  const mobsAfter: ExpeditionMobState[] = mobState
    .filter(m => m.hp > 0)
    .map(m => ({
      id: m.id,
      mobTemplateId: m.mobTemplateId,
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      stats: m.stats,
      actionTemplate: m.actionTemplate,
      activeEffects: m.activeEffects,
      ...(m.phaseTemplates ? { phaseTemplates: m.phaseTemplates } : {}),
    }));

  const roomCleared = mobsAfter.length === 0;
  const allPlayersDead = pState.every(s => s.hp <= 0);

  const participantResults: RaidParticipantResult[] = pState.map((s, i) => ({
    playerId: s.playerId,
    actionId: s.actionId,
    targetMobId: s.targetMobId,
    wasExhausted: s.wasExhausted,
    damageDealt: s.damageDealt,
    healingDone: s.healingDone,
    damageTaken: s.damageTaken,
    hpAfter: Math.max(0, s.hp),
    staminaAfter: Math.max(0, s.stamina),
    manaAfter: Math.max(0, s.mana),
    templateRoundAfter: s.templateRound,
    isDead: s.hp <= 0,
    hit: s.hit,
    isCritical: s.isCritical,
    activeEffectsAfter: participantEffectsAfter[i],
    potionsConsumed: perParticipantPotions.get(i) ?? [],
  }));

  // --- Step 12: Build telegraphs (look ahead to each alive mob's NEXT action) ---
  const telegraphs: MobTelegraphEntry[] = [];
  for (const mob of mobState) {
    if (mob.hp <= 0) continue;
    const nextIndex = input.roundNumber % mob.actionTemplate.length;
    const nextAction = mob.actionTemplate[nextIndex];
    if (nextAction?.isTelegraphed) {
      telegraphs.push({
        mobId: mob.id,
        mobName: mobDisplayName(mob),
        actionId: nextAction.actionId,
        actionLabel: nextAction.label ?? actionLabel(nextAction.actionId, mobActionDefs),
        targetMode: nextAction.targetMode,
        warningText: `${mobDisplayName(mob)} is preparing ${nextAction.label ?? actionLabel(nextAction.actionId, mobActionDefs)}!`,
      });
    }
  }

  // --- Build round log ---
  // Count kills from mobs that were alive at start (excludes summons from inflating count)
  const mobsKilledThisRound = Math.max(0, originalMobCount - mobsAfter.filter(m => !m.id.startsWith('mob-summon-')).length);
  const roundLog: ExpeditionRoundLog = {
    round: input.roundNumber,
    roomIndex: 0, // Will be set by the service layer
    phases: {
      playerAttacks: logPlayerAttacks,
      defences: logDefences,
      mobActions: logMobActions,
      healing: logHealing,
      effectTicks: logEffectTicks,
      outcome: {
        mobsAlive: mobsAfter.length,
        mobsKilled: mobsKilledThisRound,
        playersAlive: pState.filter(s => s.hp > 0).length,
        playersKnockedOut: pState.filter(s => s.hp <= 0).length,
        roomCleared,
        wipe: allPlayersDead,
      },
    },
    telegraphs,
  };

  return {
    mobsAfter,
    participantResults,
    mobActionResults,
    threatTableAfter: input.threatTable,
    roomCleared,
    allPlayersDead,
    roundLog,
    allPotionsConsumed,
  };
}
