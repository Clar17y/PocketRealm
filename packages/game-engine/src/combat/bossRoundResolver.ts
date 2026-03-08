import type {
  CombatantStats,
  ActionDefinition,
  CombatTemplateSlotData,
  BossTemplateAction,
  BossActiveEffect,
  BossTargetMode,
} from '@pocketrealm/shared';
import { COMBAT_CONSTANTS } from '@pocketrealm/shared';
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
  type ThreatEntry,
} from './threatSystem';
import {
  rollD20 as defaultRollD20,
  rollDamage as defaultRollDamage,
  isCriticalHit as defaultIsCriticalHit,
  doesAttackHit,
  calculateFinalDamage,
} from './damageCalculator';

// --- Input Types ---

export interface BossRoundParticipant {
  playerId: string;
  stats: CombatantStats;
  template: CombatTemplateSlotData[];
  actionDefinitions: Record<string, ActionDefinition>;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  templateRound: number;
  activeEffects: BossActiveEffect[];
}

export interface BossState {
  hp: number;
  maxHp: number;
  stats: CombatantStats;
  template: BossTemplateAction[];
  actionDefinitions: Record<string, ActionDefinition>;
  roundNumber: number;
  activeEffects: BossActiveEffect[];
}

export interface BossRoundInput {
  boss: BossState;
  participants: BossRoundParticipant[];
  threatTable: ThreatEntry[];
}

// --- Output Types ---

export interface BossRoundParticipantResult {
  playerId: string;
  actionId: string;
  wasExhausted: boolean;
  damageDealt: number;
  healingDone: number;
  damageTaken: number;
  damageAbsorbed: number;
  hpAfter: number;
  staminaAfter: number;
  manaAfter: number;
  templateRoundAfter: number;
  isDead: boolean;
  hit: boolean;
  isCritical: boolean;
}

export interface BossRoundResult {
  bossHpAfter: number;
  bossDefeated: boolean;
  bossActionId: string;
  bossTargetMode: BossTargetMode;
  bossTargetPlayerIds: string[];
  participantResults: BossRoundParticipantResult[];
  threatTableAfter: ThreatEntry[];
  bossActiveEffectsAfter: BossActiveEffect[];
  allPlayersDead: boolean;
}

// --- RNG Interface ---

export interface BossRoundRng {
  rollD20: () => number;
  rollDamage: (min: number, max: number) => number;
  rollCrit: (chance: number) => boolean;
}

// --- Resolver ---

export function resolveBossRound(
  input: BossRoundInput,
  rng?: BossRoundRng,
): BossRoundResult {
  const roll = rng ?? {
    rollD20: defaultRollD20,
    rollDamage: defaultRollDamage,
    rollCrit: defaultIsCriticalHit,
  };

  let bossHp = input.boss.hp;
  const bossStats = input.boss.stats;

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
    damageAbsorbed: 0,
    actionId: 'defend',
    wasExhausted: false,
    hit: false,
    isCritical: false,
    actionDef: null as ActionDefinition | null,
  }));

  // --- Step 1: Pick actions for all participants ---
  resolveParticipantActions(input.participants, pState);

  // Pick boss action
  const bossActionIndex = (input.boss.roundNumber - 1) % input.boss.template.length;
  const bossTemplateAction = input.boss.template[bossActionIndex];
  const bossActionDef = input.boss.actionDefinitions[bossTemplateAction.actionId];
  const bossActionId = bossTemplateAction.actionId;
  const bossTargetMode = bossTemplateAction.targetMode;

  // --- Step 2: Resource costs already checked by resolveAction fallback ---

  // --- Step 3: Apply Taunt ---
  for (let i = 0; i < input.participants.length; i++) {
    const s = pState[i];
    if (s.actionDef?.tauntDuration && s.actionDef.tauntDuration > 0) {
      applyTaunt(input.threatTable, s.playerId, s.actionDef.tauntDuration);
    }
  }

  // --- Step 4: Record defensive stances ---
  const defStances = new Map<string, {
    avoidsPhysical: boolean;
    resistsMagic: boolean;
    damageReductionPercent: number;
  }>();
  for (let i = 0; i < pState.length; i++) {
    const s = pState[i];
    const def = s.actionDef;
    defStances.set(s.playerId, {
      avoidsPhysical: def?.avoidsPhysical ?? false,
      resistsMagic: def?.resistsMagic ?? false,
      damageReductionPercent: def?.damageReductionPercent ?? 0,
    });
  }

  // --- Step 5: Offensive actions resolve against boss ---
  for (let i = 0; i < input.participants.length; i++) {
    const p = input.participants[i];
    const s = pState[i];
    const def = s.actionDef;
    if (!def || def.category !== 'offensive' || (def.damageMultiplier ?? 0) <= 0) continue;

    const attackRoll = roll.rollD20();
    const hits = doesAttackHit(attackRoll, p.stats.accuracy + (def.accuracyModifier ?? 0), bossStats.dodge, 0);

    if (!hits) {
      s.hit = false;
      continue;
    }

    const rawDmg = roll.rollDamage(p.stats.damageMin, p.stats.damageMax);
    const scaledDmg = Math.floor(rawDmg * (def.damageMultiplier ?? 1.0));
    const crit = roll.rollCrit(p.stats.critChance ?? 0);
    const effectiveDefence = (def.damageType === 'magic' || p.stats.damageType === 'magic')
      ? bossStats.magicDefence
      : bossStats.defence;
    const { damage } = calculateFinalDamage(scaledDmg, effectiveDefence, crit, p.stats.critDamage ?? 0);

    bossHp -= damage;
    s.damageDealt = damage;
    s.hit = true;
    s.isCritical = crit;
    addDamageThreat(input.threatTable, s.playerId, damage);
  }

  const bossDefeated = bossHp <= 0;
  bossHp = Math.max(0, bossHp);

  // --- Step 6: Supportive actions ---
  resolveSupportiveActions(input.participants, pState, input.threatTable);

  // --- Step 7: Boss action resolves against target(s) ---
  const bossTargetPlayerIds: string[] = [];

  if (!bossDefeated && bossActionDef) {
    // Refresh alive set after supportive phase
    const aliveAfterSupport = new Set(pState.filter(s => s.hp > 0).map(s => s.playerId));

    if (bossActionDef.category === 'offensive' || bossActionDef.actionType === 'debuff_spell') {
      let targets: string[] = [];
      const currentAggroHolder = getSingleTarget(input.threatTable, aliveAfterSupport);

      if (bossTargetMode === 'single_target') {
        if (currentAggroHolder) targets = [currentAggroHolder];
      } else {
        targets = Array.from(aliveAfterSupport);
      }

      const bossIsMagic = bossActionDef.damageType === 'magic';
      const bossIsPhysical = !bossIsMagic;

      for (const targetId of targets) {
        bossTargetPlayerIds.push(targetId);
        const targetState = pState.find(ps => ps.playerId === targetId);
        const targetParticipant = input.participants.find(pp => pp.playerId === targetId);
        if (!targetState || !targetParticipant) continue;

        const stance = defStances.get(targetId);

        if (stance?.avoidsPhysical && bossIsPhysical) {
          continue;
        }
        if (stance?.resistsMagic && bossIsMagic) {
          continue;
        }

        const bossDmgRaw = roll.rollDamage(bossStats.damageMin, bossStats.damageMax);
        const scaledBossDmg = Math.floor(bossDmgRaw * (bossActionDef.damageMultiplier ?? 1.0));
        const effectivePlayerDefence = bossIsMagic
          ? targetParticipant.stats.magicDefence
          : targetParticipant.stats.defence;

        let damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, scaledBossDmg - effectivePlayerDefence);

        if (stance?.damageReductionPercent && stance.damageReductionPercent > 0) {
          damage = Math.floor(damage * (1 - stance.damageReductionPercent));
          damage = Math.max(COMBAT_CONSTANTS.MIN_DAMAGE, damage);
        }

        targetState.damageTaken += damage;
        targetState.hp = Math.max(0, targetState.hp - damage);

        if (targetId === currentAggroHolder) {
          targetState.damageAbsorbed += damage;
        }
      }
    }

    // Boss heal_self
    if (bossActionDef.actionType === 'heal_self') {
      const healAmount = Math.floor((bossActionDef.healPercent ?? 0) * input.boss.maxHp) + (bossActionDef.healFlat ?? 0);
      bossHp = Math.min(input.boss.maxHp, bossHp + healAmount);
    }
  }

  // --- Step 8: End-of-round ---

  // Deduct resource costs and apply regen
  applyResourceCosts(input.participants, pState);

  // Tick taunt durations
  tickTaunts(input.threatTable);

  // Death checks
  const allPlayersDead = pState.every(s => s.hp <= 0);

  // Build active effects (pass through for now — effect system expansion in future)
  const bossActiveEffectsAfter = [...input.boss.activeEffects];

  // --- Build results ---
  const participantResults: BossRoundParticipantResult[] = pState.map(s => ({
    playerId: s.playerId,
    actionId: s.actionId,
    wasExhausted: s.wasExhausted,
    damageDealt: s.damageDealt,
    healingDone: s.healingDone,
    damageTaken: s.damageTaken,
    damageAbsorbed: s.damageAbsorbed,
    hpAfter: Math.max(0, s.hp),
    staminaAfter: Math.max(0, s.stamina),
    manaAfter: Math.max(0, s.mana),
    templateRoundAfter: s.templateRound,
    isDead: s.hp <= 0,
    hit: s.hit,
    isCritical: s.isCritical,
  }));

  return {
    bossHpAfter: bossHp,
    bossDefeated,
    bossActionId,
    bossTargetMode,
    bossTargetPlayerIds,
    participantResults,
    threatTableAfter: input.threatTable,
    bossActiveEffectsAfter,
    allPlayersDead,
  };
}
