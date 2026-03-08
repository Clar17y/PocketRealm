import type {
  ActionDefinition,
  BossActiveEffect,
  RaidRoundInput,
  RaidParticipantResult,
  MobActionResult,
  RaidRoundResult,
  ExpeditionMobState,
} from '@pocketrealm/shared';
import { COMBAT_CONSTANTS, COMBAT_ACTION_CONSTANTS, BOSS_ACTION_DEFINITIONS } from '@pocketrealm/shared';
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

/**
 * Check if a mob's HP has dropped below a phase threshold and swap its action
 * template to the more aggressive phase. phaseTemplates must be sorted by
 * threshold ascending (lowest/most aggressive first) so the first match wins.
 */
function checkPhaseTransition(mob: ExpeditionMobState): void {
  if (!mob.phaseTemplates || mob.phaseTemplates.length === 0) return;
  for (const phase of mob.phaseTemplates) {
    if (mob.hp <= mob.maxHp * phase.hpThreshold && mob.actionTemplate !== phase.template) {
      mob.actionTemplate = phase.template;
      break;
    }
  }
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

  // Mutable copies of mob state
  const mobState = input.mobs.map(m => ({
    ...m,
    hp: m.hp,
    activeEffects: [...m.activeEffects],
  }));

  // Merge boss action definitions for mob lookups
  const mobActionDefs: Record<string, ActionDefinition> = { ...BOSS_ACTION_DEFINITIONS };

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
  }));

  // --- Step 1: Pick actions for all alive participants ---
  resolveParticipantActions(input.participants, pState);

  // --- Step 2: Apply taunts ---
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

    const targets = isAoe
      ? aliveMobs
      : [aliveMobs.reduce((lowest, m) => m.hp < lowest.hp ? m : lowest)];

    s.targetMobId = isAoe ? null : targets[0].id;

    let totalDamageDealt = 0;

    for (const target of targets) {
      const attackRoll = roll.rollD20();
      const hits = doesAttackHit(
        attackRoll,
        p.stats.accuracy + (def.accuracyModifier ?? 0),
        target.stats.dodge,
        0,
      );

      if (!hits) continue;

      s.hit = true;
      const rawDmg = roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
      const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
      const crit = roll.rollCrit(p.stats.critChance ?? 0);
      if (crit) s.isCritical = true;

      const effectiveDefence = (def.damageType === 'magic' || p.stats.damageType === 'magic')
        ? target.stats.magicDefence
        : target.stats.defence;
      const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);

      target.hp = Math.max(0, target.hp - damage);
      totalDamageDealt += damage;
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

  // --- Step 6: Mob offensive phase ---
  const mobActionResults: MobActionResult[] = [];

  for (const mob of mobState) {
    if (mob.hp <= 0) continue;

    const actionIndex = (input.roundNumber - 1) % mob.actionTemplate.length;
    const templateAction = mob.actionTemplate[actionIndex];
    const actionDef = mobActionDefs[templateAction.actionId];
    if (!actionDef) continue;

    const mobResult: MobActionResult = {
      mobId: mob.id,
      actionId: templateAction.actionId,
      targetMode: templateAction.targetMode,
      targetPlayerIds: [],
      damageDealt: 0,
      healingDone: 0,
    };

    // Refresh alive set
    const aliveAfterOffensive = new Set(pState.filter(s => s.hp > 0).map(s => s.playerId));
    if (aliveAfterOffensive.size === 0) {
      mobActionResults.push(mobResult);
      continue;
    }

    if (actionDef.category === 'offensive' || actionDef.actionType === 'debuff_spell') {
      let targets: string[] = [];
      const currentAggroHolder = getSingleTarget(input.threatTable, aliveAfterOffensive);

      if (templateAction.targetMode === 'single_target') {
        if (currentAggroHolder) targets = [currentAggroHolder];
      } else {
        targets = Array.from(aliveAfterOffensive);
      }

      const isMagic = actionDef.damageType === 'magic';
      const isPhysical = !isMagic;

      for (const targetId of targets) {
        mobResult.targetPlayerIds.push(targetId);
        const targetState = pState.find(ps => ps.playerId === targetId);
        const targetParticipant = input.participants.find(pp => pp.playerId === targetId);
        if (!targetState || !targetParticipant) continue;

        const stance = defStances.get(targetId);

        // Counter avoids physical
        if (stance?.avoidsPhysical && isPhysical) continue;
        // Ward avoids magic
        if (stance?.resistsMagic && isMagic) continue;

        const dmgRaw = roll.rollDamage(mob.stats.damageMin, mob.stats.damageMax);
        const scaledDmg = Math.floor(dmgRaw * (actionDef.damageMultiplier ?? 1.0));

        const effectivePlayerDefence = isMagic
          ? targetParticipant.stats.magicDefence
          : targetParticipant.stats.defence;

        let damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, scaledDmg - effectivePlayerDefence);

        // Channeling vulnerability: +50% damage via CHANNELING_BONUS_DAMAGE
        if (stance?.isChanneling) {
          damage = Math.floor(damage * COMBAT_ACTION_CONSTANTS.CHANNELING_BONUS_DAMAGE);
        }

        // Defend damage reduction
        if (stance?.damageReductionPercent && stance.damageReductionPercent > 0) {
          damage = Math.floor(damage * (1 - stance.damageReductionPercent));
          damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, damage);
        }

        targetState.damageTaken += damage;
        targetState.hp = Math.max(0, targetState.hp - damage);
        mobResult.damageDealt += damage;
      }
    }

    // Mob heal_self
    if (actionDef.actionType === 'heal_self') {
      const healAmount = Math.floor((actionDef.healPercent ?? 0) * mob.maxHp) + (actionDef.healFlat ?? 0);
      const actualHeal = Math.min(healAmount, mob.maxHp - mob.hp);
      mob.hp += actualHeal;
      mobResult.healingDone = actualHeal;
    }

    // Mob enrage/buff — applied to the mob itself
    if (actionDef.actionType === 'buff' && actionDef.effect) {
      mob.activeEffects.push({
        name: actionDef.effect.name,
        stat: actionDef.effect.stat,
        modifier: actionDef.effect.modifier,
        roundsRemaining: actionDef.effect.duration,
      });
    }

    mobActionResults.push(mobResult);
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
  // Tick mob active effects
  for (const mob of mobState) {
    const remaining: BossActiveEffect[] = [];
    for (const effect of mob.activeEffects) {
      effect.roundsRemaining -= 1;
      if (effect.roundsRemaining > 0) {
        remaining.push(effect);
      }
    }
    mob.activeEffects = remaining;
  }

  // Tick player active effects
  const participantEffectsAfter: BossActiveEffect[][] = input.participants.map(p => {
    const remaining: BossActiveEffect[] = [];
    for (const effect of p.activeEffects) {
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
  }));

  return {
    mobsAfter,
    participantResults,
    mobActionResults,
    threatTableAfter: input.threatTable,
    roomCleared,
    allPlayersDead,
  };
}
