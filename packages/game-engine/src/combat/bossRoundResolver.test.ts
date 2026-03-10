import { describe, it, expect } from 'vitest';
import type { CombatantStats, ActionDefinition, CombatTemplateSlotData, BossTemplateAction } from '@pocketrealm/shared';
import { BASE_ACTION_DEFINITIONS, BOSS_ACTION_DEFINITIONS } from '@pocketrealm/shared';
import { resolveBossRound } from './bossRoundResolver';
import type { BossRoundParticipant, BossState, BossRoundInput } from './bossRoundResolver';
import { initThreatTable } from './threatSystem';

// --- Helpers ---

function makeStats(overrides: Partial<CombatantStats> = {}): CombatantStats {
  return {
    hp: 100, maxHp: 100, attack: 20, accuracy: 10, defence: 5,
    magicDefence: 3, dodge: 5, evasion: 0, damageMin: 8, damageMax: 12,
    speed: 0, critChance: 0, critDamage: 0, damageType: 'physical',
    ...overrides,
  };
}

function slotOf(actionId: string, index = 0): CombatTemplateSlotData {
  return { id: `slot-${index}`, sortOrder: index, actionId };
}

function slotsOf(...actionIds: string[]): CombatTemplateSlotData[] {
  return actionIds.map((id, i) => slotOf(id, i));
}

function makeParticipant(overrides: Partial<BossRoundParticipant> = {}): BossRoundParticipant {
  return {
    playerId: 'p1',
    stats: makeStats(),
    template: [slotOf('normal_attack')],
    actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
    hp: 100,
    maxHp: 100,
    stamina: 100,
    maxStamina: 100,
    staminaRegenPerRound: 10,
    mana: 50,
    maxMana: 50,
    manaRegenPerRound: 5,
    templateRound: 1,
    activeEffects: [],
    ...overrides,
  };
}

function makeBoss(overrides: Partial<BossState> = {}): BossState {
  return {
    hp: 500,
    maxHp: 500,
    stats: makeStats({ damageMin: 20, damageMax: 30, dodge: 5, defence: 10 }),
    template: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' as const }],
    actionDefinitions: { ...BOSS_ACTION_DEFINITIONS },
    roundNumber: 1,
    activeEffects: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<BossRoundInput> = {}): BossRoundInput {
  const participants = overrides.participants ?? [makeParticipant()];
  return {
    boss: overrides.boss ?? makeBoss(),
    participants,
    threatTable: overrides.threatTable ?? initThreatTable(participants.map(p => p.playerId)),
  };
}

// Deterministic RNG: always hit, never crit, fixed damage
const alwaysHitRng = {
  rollD20: () => 15,
  rollHit: () => 0,
  rollDamage: (min: number, _max: number) => min,
  rollCrit: (_chance: number) => false,
};

const alwaysMissRng = {
  rollD20: () => 1,
  rollHit: () => 0.99,
  rollDamage: (min: number, _max: number) => min,
  rollCrit: (_chance: number) => false,
};

const alwaysCritRng = {
  rollD20: () => 20,
  rollHit: () => 0,
  rollDamage: (_min: number, max: number) => max,
  rollCrit: (_chance: number) => true,
};

describe('resolveBossRound', () => {
  describe('template advancement and resource fallback', () => {
    it('picks action from template at the correct round index', () => {
      const template = slotsOf('light_attack', 'heavy_attack');
      const p = makeParticipant({ template, templateRound: 2 });
      const result = resolveBossRound(makeInput({ participants: [p] }), alwaysHitRng);
      // Round 2 → index 1 → heavy_attack
      expect(result.participantResults[0].actionId).toBe('heavy_attack');
    });

    it('falls back to defend when stamina insufficient', () => {
      const p = makeParticipant({ stamina: 0 });
      const result = resolveBossRound(makeInput({ participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].actionId).toBe('defend');
      expect(result.participantResults[0].wasExhausted).toBe(true);
    });

    it('wraps template on overflow (cyclic)', () => {
      const template = slotsOf('normal_attack');
      const p = makeParticipant({ template, templateRound: 5 });
      const result = resolveBossRound(makeInput({ participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].actionId).toBe('normal_attack');
    });
  });

  describe('offensive actions deal damage to boss', () => {
    it('reduces boss HP on hit', () => {
      const result = resolveBossRound(makeInput(), alwaysHitRng);
      expect(result.bossHpAfter).toBeLessThan(500);
      expect(result.participantResults[0].hit).toBe(true);
      expect(result.participantResults[0].damageDealt).toBeGreaterThan(0);
    });

    it('uses boss hit-curve tuning instead of threshold hit checks', () => {
      const result = resolveBossRound(
        makeInput({
          boss: makeBoss({
            stats: makeStats({ dodge: 25, defence: 10 }),
          }),
          participants: [
            makeParticipant({
              stats: makeStats({ accuracy: 10, damageMin: 20, damageMax: 20 }),
            }),
          ],
        }),
        {
          rollD20: () => 15,
          rollHit: () => 0.34,
          rollDamage: (min: number, _max: number) => min,
          rollCrit: (_chance: number) => false,
        },
      );

      expect(result.participantResults[0].hit).toBe(true);
      expect(result.participantResults[0].damageDealt).toBeGreaterThan(0);
    });

    it('misses reduce boss HP by 0', () => {
      const result = resolveBossRound(makeInput(), alwaysMissRng);
      expect(result.bossHpAfter).toBe(500);
      expect(result.participantResults[0].hit).toBe(false);
      expect(result.participantResults[0].damageDealt).toBe(0);
    });

    it('crit hits deal increased damage', () => {
      const normalResult = resolveBossRound(makeInput(), alwaysHitRng);
      const critResult = resolveBossRound(makeInput(), alwaysCritRng);
      expect(critResult.participantResults[0].damageDealt).toBeGreaterThan(
        normalResult.participantResults[0].damageDealt,
      );
      expect(critResult.participantResults[0].isCritical).toBe(true);
    });
  });

  describe('boss single-target targets highest threat', () => {
    it('hits the player with the highest threat', () => {
      const p1 = makeParticipant({ playerId: 'tank', hp: 200, maxHp: 200 });
      const p2 = makeParticipant({ playerId: 'dps', hp: 100, maxHp: 100 });
      const threatTable = initThreatTable(['tank', 'dps']);
      threatTable[0].threat = 500;
      threatTable[1].threat = 100;

      const result = resolveBossRound(
        makeInput({ participants: [p1, p2], threatTable }),
        alwaysHitRng,
      );
      expect(result.bossTargetPlayerIds).toContain('tank');
      const tankResult = result.participantResults.find(r => r.playerId === 'tank')!;
      expect(tankResult.damageTaken).toBeGreaterThan(0);
    });
  });

  describe('boss AoE hits all alive players', () => {
    it('damages all alive participants', () => {
      const bossTemplate: BossTemplateAction[] = [
        { actionId: 'boss_earthquake', targetMode: 'aoe' },
      ];
      const boss = makeBoss({ template: bossTemplate });
      const p1 = makeParticipant({ playerId: 'p1', hp: 200, maxHp: 200 });
      const p2 = makeParticipant({ playerId: 'p2', hp: 200, maxHp: 200 });

      const result = resolveBossRound(
        makeInput({ boss, participants: [p1, p2] }),
        alwaysHitRng,
      );
      expect(result.bossTargetMode).toBe('aoe');
      expect(result.bossTargetPlayerIds).toHaveLength(2);
      expect(result.participantResults[0].damageTaken).toBeGreaterThan(0);
      expect(result.participantResults[1].damageTaken).toBeGreaterThan(0);
    });
  });

  describe('defensive stances', () => {
    it('counter blocks physical boss attack', () => {
      const p = makeParticipant({
        template: slotsOf('counter'),
        stamina: 100,
      });
      const boss = makeBoss({
        template: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
      });
      const result = resolveBossRound(makeInput({ boss, participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].damageTaken).toBe(0);
    });

    it('ward blocks magic boss attack', () => {
      const p = makeParticipant({
        template: slotsOf('ward'),
        mana: 100,
      });
      const boss = makeBoss({
        template: [{ actionId: 'boss_magic_attack', targetMode: 'single_target' }],
      });
      const result = resolveBossRound(makeInput({ boss, participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].damageTaken).toBe(0);
    });

    it('defend reduces boss damage', () => {
      const pDefend = makeParticipant({
        template: slotsOf('defend'),
        hp: 200, maxHp: 200,
      });
      const pNoDefend = makeParticipant({
        template: slotsOf('normal_attack'),
        hp: 200, maxHp: 200,
      });
      const boss = makeBoss({
        template: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
      });

      const defendResult = resolveBossRound(makeInput({ boss, participants: [pDefend] }), alwaysHitRng);
      const noDefendResult = resolveBossRound(makeInput({ boss, participants: [pNoDefend] }), alwaysHitRng);
      expect(defendResult.participantResults[0].damageTaken).toBeLessThan(
        noDefendResult.participantResults[0].damageTaken,
      );
    });

    it('counter does NOT block magic boss attack', () => {
      const p = makeParticipant({
        template: slotsOf('counter'),
        stamina: 100,
        hp: 200, maxHp: 200,
      });
      const boss = makeBoss({
        template: [{ actionId: 'boss_magic_attack', targetMode: 'single_target' }],
      });
      const result = resolveBossRound(makeInput({ boss, participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].damageTaken).toBeGreaterThan(0);
    });
  });

  describe('taunt updates threat table', () => {
    it('taunting player becomes target even with lower damage', () => {
      const tauntAction: ActionDefinition = {
        id: 'taunt',
        name: 'Taunt',
        description: 'Force boss to target you',
        actionType: 'taunt',
        category: 'supportive',
        cost: { stamina: 20, mana: 0 },
        tauntDuration: 2,
      };
      const tank = makeParticipant({
        playerId: 'tank',
        hp: 200, maxHp: 200,
        stamina: 100, maxStamina: 100,
        template: slotsOf('taunt'),
        actionDefinitions: { ...BASE_ACTION_DEFINITIONS, taunt: tauntAction },
      });
      const dps = makeParticipant({
        playerId: 'dps',
        template: slotsOf('normal_attack'),
      });
      const threatTable = initThreatTable(['tank', 'dps']);
      threatTable[1].threat = 1000; // DPS has much higher threat

      const result = resolveBossRound(
        makeInput({ participants: [tank, dps], threatTable }),
        alwaysHitRng,
      );
      expect(result.bossTargetPlayerIds).toContain('tank');
    });
  });

  describe('supportive actions', () => {
    it('heal_self restores player HP', () => {
      const healAction: ActionDefinition = {
        id: 'heal_self',
        name: 'Heal',
        description: 'Heal self',
        actionType: 'heal_self',
        category: 'supportive',
        cost: { stamina: 10, mana: 30 },
        healFlat: 25,
        healPercent: 0.1,
        isChanneling: true,
      };
      const p = makeParticipant({
        hp: 50,
        maxHp: 100,
        mana: 100,
        template: slotsOf('heal_self'),
        actionDefinitions: { ...BASE_ACTION_DEFINITIONS, heal_self: healAction },
      });
      const boss = makeBoss({
        template: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      });
      const result = resolveBossRound(makeInput({ boss, participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].healingDone).toBeGreaterThan(0);
      expect(result.participantResults[0].hpAfter).toBeGreaterThan(50);
    });
  });

  describe('end-of-round processing', () => {
    it('regenerates stamina and mana', () => {
      const p = makeParticipant({
        stamina: 50, maxStamina: 100, staminaRegenPerRound: 10,
        mana: 20, maxMana: 50, manaRegenPerRound: 5,
        template: slotsOf('defend'),
      });
      const boss = makeBoss({
        template: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      });
      const result = resolveBossRound(makeInput({ boss, participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].staminaAfter).toBe(60);
      expect(result.participantResults[0].manaAfter).toBe(25);
    });

    it('caps stamina and mana at max', () => {
      const p = makeParticipant({
        stamina: 95, maxStamina: 100, staminaRegenPerRound: 10,
        mana: 48, maxMana: 50, manaRegenPerRound: 5,
        template: slotsOf('defend'),
      });
      const boss = makeBoss({
        template: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      });
      const result = resolveBossRound(makeInput({ boss, participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].staminaAfter).toBe(100);
      expect(result.participantResults[0].manaAfter).toBe(50);
    });

    it('advances templateRound by 1', () => {
      const p = makeParticipant({ templateRound: 3 });
      const result = resolveBossRound(makeInput({ participants: [p] }), alwaysHitRng);
      expect(result.participantResults[0].templateRoundAfter).toBe(4);
    });

    it('marks player as dead when HP reaches 0', () => {
      const p = makeParticipant({ hp: 1, maxHp: 100 });
      const boss = makeBoss({
        stats: makeStats({ damageMin: 50, damageMax: 50 }),
        template: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
      });
      const result = resolveBossRound(
        makeInput({ boss, participants: [p] }),
        alwaysHitRng,
      );
      expect(result.participantResults[0].isDead).toBe(true);
      expect(result.participantResults[0].hpAfter).toBe(0);
    });
  });

  describe('boss defeat', () => {
    it('boss is defeated when HP reaches 0', () => {
      const boss = makeBoss({ hp: 1 });
      const p = makeParticipant({ stats: makeStats({ damageMin: 50, damageMax: 50 }) });
      const result = resolveBossRound(
        makeInput({ boss, participants: [p] }),
        alwaysHitRng,
      );
      expect(result.bossDefeated).toBe(true);
      expect(result.bossHpAfter).toBe(0);
    });

    it('boss does not attack after being defeated', () => {
      const boss = makeBoss({ hp: 1 });
      const p = makeParticipant({ stats: makeStats({ damageMin: 50, damageMax: 50 }) });
      const result = resolveBossRound(
        makeInput({ boss, participants: [p] }),
        alwaysHitRng,
      );
      expect(result.participantResults[0].damageTaken).toBe(0);
    });
  });

  describe('all players dead (raid wipe)', () => {
    it('returns allPlayersDead when everyone dies', () => {
      const p1 = makeParticipant({ playerId: 'p1', hp: 1, maxHp: 100 });
      const p2 = makeParticipant({ playerId: 'p2', hp: 1, maxHp: 100 });
      const boss = makeBoss({
        stats: makeStats({ damageMin: 100, damageMax: 100 }),
        template: [{ actionId: 'boss_physical_attack', targetMode: 'aoe' }],
      });
      const result = resolveBossRound(
        makeInput({ boss, participants: [p1, p2] }),
        alwaysHitRng,
      );
      expect(result.allPlayersDead).toBe(true);
    });
  });

  describe('damageAbsorbed tracking', () => {
    it('tracks damage absorbed by the aggro holder', () => {
      const tank = makeParticipant({ playerId: 'tank', hp: 200, maxHp: 200 });
      const dps = makeParticipant({ playerId: 'dps' });
      const threatTable = initThreatTable(['tank', 'dps']);
      threatTable[0].threat = 500;

      const result = resolveBossRound(
        makeInput({ participants: [tank, dps], threatTable }),
        alwaysHitRng,
      );
      const tankResult = result.participantResults.find(r => r.playerId === 'tank')!;
      const dpsResult = result.participantResults.find(r => r.playerId === 'dps')!;
      expect(tankResult.damageAbsorbed).toBeGreaterThan(0);
      expect(dpsResult.damageAbsorbed).toBe(0);
    });
  });

  describe('3-player integration scenario', () => {
    it('resolves a full round with tank, dps, and healer', () => {
      const tauntAction: ActionDefinition = {
        id: 'taunt',
        name: 'Taunt',
        description: 'Force targeting',
        actionType: 'taunt',
        category: 'supportive',
        cost: { stamina: 20, mana: 0 },
        tauntDuration: 2,
      };
      const healAllyAction: ActionDefinition = {
        id: 'heal_ally',
        name: 'Heal Ally',
        description: 'Heals aggro holder',
        actionType: 'heal_ally',
        category: 'supportive',
        cost: { stamina: 10, mana: 40 },
        healFlat: 30,
        healPercent: 0,
        isChanneling: true,
      };

      const tank = makeParticipant({
        playerId: 'tank',
        hp: 80, maxHp: 200, // damaged from previous round — healer targets lowest HP
        stamina: 100, maxStamina: 100,
        template: slotsOf('taunt'),
        actionDefinitions: { ...BASE_ACTION_DEFINITIONS, taunt: tauntAction },
      });
      const dps = makeParticipant({
        playerId: 'dps',
        stats: makeStats({ damageMin: 15, damageMax: 20 }),
        template: slotsOf('normal_attack'),
      });
      const healer = makeParticipant({
        playerId: 'healer',
        mana: 100, maxMana: 100,
        template: slotsOf('heal_ally'),
        actionDefinitions: { ...BASE_ACTION_DEFINITIONS, heal_ally: healAllyAction },
      });

      const result = resolveBossRound(
        makeInput({ participants: [tank, dps, healer] }),
        alwaysHitRng,
      );

      // Boss targets tank (taunted)
      expect(result.bossTargetPlayerIds).toContain('tank');
      // DPS dealt damage to boss
      const dpsResult = result.participantResults.find(r => r.playerId === 'dps')!;
      expect(dpsResult.damageDealt).toBeGreaterThan(0);
      // Healer healed the aggro holder (tank was at 150/200, heal_ally has healFlat=30)
      const healerResult = result.participantResults.find(r => r.playerId === 'healer')!;
      expect(healerResult.healingDone).toBe(30);
      // All alive
      expect(result.participantResults.every(r => !r.isDead)).toBe(true);
    });
  });
});
