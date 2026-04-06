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
  applyResourceCosts,
  resolvePlayerBuffActions,
} from './combatHelpers';
import {
  applyTaunt,
  tickTaunts,
} from './threatSystem';
import {
  rollDamage as defaultRollDamage,
  isCriticalHit as defaultIsCriticalHit,
  applyDefenceReduction,
} from './damageCalculator';
import type { CombatMode } from '@pocketrealm/shared';
import {
  checkPhaseTransition,
  actionLabel,
  resolvePlayerOffensive,
} from './raidPlayerPhase';
import type { OffensiveAttackContext } from './raidPlayerPhase';
import { resolveMobActions } from './raidMobPhase';

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

  const { mobActionResults, logMobActions } = resolveMobActions({
    mobState,
    pState,
    input,
    defStances,
    newPlayerEffects,
    buffActionResults,
    roll,
    combatMode,
    getUsername,
    spawnedThisRound,
    mobActionDefs,
  });

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
        const dotDmg = applyDefenceReduction(effect.damagePerRound, defence);
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
        const dotDmg = applyDefenceReduction(effect.damagePerRound, defence);
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
