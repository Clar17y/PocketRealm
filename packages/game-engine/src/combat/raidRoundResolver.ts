import type {
  ActionDefinition,
  BossActiveEffect,
  RaidRoundInput,
  RaidParticipantResult,
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
  ExpeditionRoundLog,
  CombatPotion,
  PotionConsumed,
} from '@pocketrealm/shared';
import { COMBAT_CONSTANTS, COMBAT_ACTION_CONSTANTS, BOSS_ACTION_DEFINITIONS, mobDisplayName } from '@pocketrealm/shared';
import {
  resolveParticipantActions,
  resolveSupportiveActions,
  applyResourceCosts,
} from './combatHelpers';
import {
  addDamageThreat,
  applyTaunt,
  getSingleTarget,
  tickTaunts,
} from './threatSystem';
import {
  rollD20 as defaultRollD20,
  rollDamage as defaultRollDamage,
  isCriticalHit as defaultIsCriticalHit,
  doesAttackHit,
  calculateFinalDamage,
} from './damageCalculator';

// --- RNG Interface ---

export interface RaidRoundRng {
  rollD20: () => number;
  rollDamage: (min: number, max: number) => number;
  rollCrit: (chance: number) => boolean;
}

// AoE player actions — these target all surviving mobs instead of one
const AOE_ACTION_IDS = new Set([
  'cleave', 'volley', 'chain_lightning', 'meteor_strike',
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

// Sum stat modifiers from active effects for a given stat name
function getEffectiveStatValue(baseStat: number, effects: BossActiveEffect[], statName: string): number {
  const modifier = effects
    .filter(e => e.stat === statName && e.roundsRemaining > 0)
    .reduce((sum, e) => sum + e.modifier, 0);
  return Math.max(0, baseStat + modifier);
}

// --- Resolver ---

export function resolveRaidRound(
  input: RaidRoundInput,
  rng?: RaidRoundRng,
): RaidRoundResult {
  const roll = rng ?? {
    rollD20: defaultRollD20,
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
  for (let i = 0; i < input.participants.length; i++) {
    const p = input.participants[i];
    const s = pState[i];
    const def = s.actionDef;
    if (s.hp <= 0) continue;
    if (!def || def.category !== 'offensive' || (def.damageMultiplier ?? 0) <= 0) continue;

    const isAoe = AOE_ACTION_IDS.has(s.actionId);
    const aliveMobs = mobState.filter(m => m.hp > 0);
    if (aliveMobs.length === 0) continue;

    // Per-player targeting: use targetMobId if set and mob is alive, else lowest HP
    let targets: typeof mobState;
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
    const modifier = p.stats.accuracy + (def.accuracyModifier ?? 0);

    for (const target of targets) {
      const attackRoll = roll.rollD20();
      const defenseTarget = target.stats.dodge;
      const hits = doesAttackHit(attackRoll, modifier, defenseTarget, 0);

      const baseEntry = {
        entryType: 'attack' as const,
        playerId: p.playerId,
        username: getUsername(p.playerId),
        actionId: s.actionId,
        actionLabel: actionLabel(s.actionId, playerActionDefs),
        targetMobId: target.id,
        targetMobName: mobDisplayName(target),
        attackRoll,
        modifier,
        defenseTarget,
        staminaCost: def.cost.stamina,
        manaCost: def.cost.mana,
      };

      if (!hits) {
        logPlayerAttacks.push({ ...baseEntry, hit: false, crit: false });
        continue;
      }

      s.hit = true;
      const rawDmg = roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
      const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
      const crit = roll.rollCrit(p.stats.critChance ?? 0);
      if (crit) s.isCritical = true;

      const isMagicAttack = def.damageType === 'magic' || p.stats.damageType === 'magic';
      const effectiveDefence = isMagicAttack
        ? getEffectiveStatValue(target.stats.magicDefence, target.activeEffects, 'magicDefence')
        : getEffectiveStatValue(target.stats.defence, target.activeEffects, 'defence');
      const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);

      target.hp = Math.max(0, target.hp - damage);
      totalDamageDealt += damage;

      // Apply debuff/DoT effect to mob on hit
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

      logPlayerAttacks.push({ ...baseEntry, hit: true, crit, damageRoll: rawDmg, totalDamage: damage });
    }

    s.damageDealt = totalDamageDealt;
    if (totalDamageDealt > 0) {
      addDamageThreat(input.threatTable, s.playerId, totalDamageDealt);
    }
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

  // --- Step 5b: Potion actions ---
  const allPotionsConsumed: PotionConsumed[] = [];
  const perParticipantPotions: Map<number, PotionConsumed[]> = new Map();
  const potionSicknessToApply: { participantIndex: number }[] = [];
  // Track consumed potion indices per participant to avoid mutating input
  const consumedPotionIndices: Map<number, Set<number>> = new Map();

  for (let i = 0; i < pState.length; i++) {
    const s = pState[i];
    const p = input.participants[i];
    const def = s.actionDef;
    if (s.hp <= 0) continue;
    if (!def || def.actionType !== 'use_potion') continue;

    const potionType = def.potionType ?? 'hp';
    const potions = p.availablePotions ?? [];

    // Check potion sickness
    const hasSickness = (p.activeEffects ?? []).some(
      (e: { stat: string }) => e.stat === 'potionSickness',
    );
    if (hasSickness) continue;

    // Find matching potion, skipping already-consumed indices
    const usedIndices = consumedPotionIndices.get(i);
    const potionIndex = potions.findIndex((pt: CombatPotion, idx: number) =>
      pt.potionType === potionType && (!usedIndices || !usedIndices.has(idx)),
    );
    if (potionIndex === -1) continue;

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
  }

  // --- Step 6: Mob offensive phase ---
  // Accumulator for new effects applied to players this round by mob actions
  const newPlayerEffects: Map<number, BossActiveEffect[]> = new Map();
  const mobActionResults: MobActionResult[] = [];

  for (const mob of mobState) {
    if (mob.hp <= 0) continue;

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
      const MAX_TOTAL_SUMMONS = 8;
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

        const stance = defStances.get(targetId);

        // Counter avoids physical
        const blocked = (stance?.avoidsPhysical && isPhysical) || (stance?.resistsMagic && isMagic);
        if (blocked) {
          mobLogEntry.targets.push({
            playerId: targetId,
            username: getUsername(targetId),
            damageTaken: 0,
            blocked: true,
            knockedOut: false,
          });
          continue;
        }

        const dmgRaw = roll.rollDamage(mob.stats.damageMin, mob.stats.damageMax);
        // Apply mob attack buffs (rally/frenzy) as flat bonus damage
        const mobAttackBonus = getEffectiveStatValue(0, mob.activeEffects, 'attack');
        let baseDmg = Math.floor(dmgRaw * (mActionDef.damageMultiplier ?? 1.0)) + mobAttackBonus;

        // Combine input effects + newly applied effects this round for target checks
        const targetIdx = pState.findIndex(ps => ps.playerId === targetId);
        const combinedTargetEffects = [
          ...(targetParticipant.activeEffects ?? []),
          ...(targetIdx >= 0 ? (newPlayerEffects.get(targetIdx) ?? []) : []),
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
          knockedOut: targetState.hp <= 0,
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
  // Tick mob effects: apply DoT damage, then decrement duration
  for (const mob of mobState) {
    if (mob.hp <= 0) continue;
    const remaining: BossActiveEffect[] = [];
    for (const effect of mob.activeEffects) {
      // Apply DoT damage
      if (effect.damagePerRound && effect.damagePerRound > 0 && mob.hp > 0) {
        const defence = effect.dotDamageType === 'physical' ? mob.stats.defence : mob.stats.magicDefence;
        const dotDmg = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, effect.damagePerRound - defence);
        mob.hp = Math.max(0, mob.hp - dotDmg);
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
    const effects = [...(p.activeEffects ?? [])];
    // Merge new effects applied by mob actions this round
    const mobAppliedEffects = newPlayerEffects.get(idx);
    if (mobAppliedEffects) {
      effects.push(...mobAppliedEffects);
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
      const nextDef = mobActionDefs[nextAction.actionId];
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
