import { describe, it, expect } from 'vitest';
import type {
  CombatantStats,
  ActionDefinition,
  BossTemplateAction,
  RaidRoundInput,
  RaidParticipant,
  ExpeditionMobState,
} from '@pocketrealm/shared';
import { BASE_ACTION_DEFINITIONS, BOSS_ACTION_DEFINITIONS } from '@pocketrealm/shared';
import { resolveRaidRound } from './raidRoundResolver';
import type { RaidRoundRng } from './raidRoundResolver';
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

function makeParticipant(overrides: Partial<RaidParticipant> = {}): RaidParticipant {
  return {
    playerId: 'p1',
    stats: makeStats(),
    template: [{ actionId: 'normal_attack', sortOrder: 0 }],
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

function makeMob(overrides: Partial<ExpeditionMobState> = {}): ExpeditionMobState {
  return {
    id: 'mob1',
    mobTemplateId: 'goblin',
    name: 'Goblin',
    prefix: null,
    hp: 80,
    maxHp: 80,
    stats: makeStats({ damageMin: 10, damageMax: 15, dodge: 3, defence: 4, magicDefence: 2 }),
    actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
    activeEffects: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<RaidRoundInput> = {}): RaidRoundInput {
  const participants = overrides.participants ?? [makeParticipant()];
  return {
    mobs: overrides.mobs ?? [makeMob()],
    participants,
    threatTable: overrides.threatTable ?? initThreatTable(participants.map(p => p.playerId)),
    roundNumber: overrides.roundNumber ?? 1,
    environmentalDotPercent: overrides.environmentalDotPercent,
  };
}

// Deterministic RNG: always hit, never crit, fixed damage at min
const alwaysHitRng: RaidRoundRng = {
  rollD20: () => 15,
  rollDamage: (min: number, _max: number) => min,
  rollCrit: (_chance: number) => false,
};

const alwaysMissRng: RaidRoundRng = {
  rollD20: () => 1,
  rollDamage: (min: number, _max: number) => min,
  rollCrit: (_chance: number) => false,
};

const alwaysCritRng: RaidRoundRng = {
  rollD20: () => 20,
  rollDamage: (_min: number, max: number) => max,
  rollCrit: (_chance: number) => true,
};

describe('resolveRaidRound', () => {
  describe('basic round: 2 participants vs 2 mobs', () => {
    it('all actors act and damage is dealt', () => {
      const p1 = makeParticipant({ playerId: 'p1' });
      const p2 = makeParticipant({ playerId: 'p2' });
      const mob1 = makeMob({ id: 'mob1', hp: 80 });
      const mob2 = makeMob({ id: 'mob2', hp: 80 });

      const result = resolveRaidRound(
        makeInput({ participants: [p1, p2], mobs: [mob1, mob2] }),
        alwaysHitRng,
      );

      // Both players should have acted
      expect(result.participantResults).toHaveLength(2);
      expect(result.participantResults[0].actionId).toBe('normal_attack');
      expect(result.participantResults[1].actionId).toBe('normal_attack');

      // Both players should have dealt damage
      expect(result.participantResults[0].damageDealt).toBeGreaterThan(0);
      expect(result.participantResults[1].damageDealt).toBeGreaterThan(0);

      // Both mobs should have attacked
      expect(result.mobActionResults).toHaveLength(2);
      expect(result.mobActionResults[0].damageDealt).toBeGreaterThan(0);
      expect(result.mobActionResults[1].damageDealt).toBeGreaterThan(0);
    });
  });

  describe('auto-target lowest HP mob', () => {
    it('single-target attacks hit the mob with lowest HP', () => {
      const p1 = makeParticipant({ playerId: 'p1' });
      const mob1 = makeMob({ id: 'mob1', hp: 80 });
      const mob2 = makeMob({ id: 'mob2', hp: 30 }); // lower HP

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1, mob2] }),
        alwaysHitRng,
      );

      // Player should target mob2 (lower HP)
      expect(result.participantResults[0].targetMobId).toBe('mob2');
    });
  });

  describe('AoE hits all mobs', () => {
    it('an AoE action damages all surviving mobs', () => {
      // chain_lightning is a magic AoE-style attack (we treat actions without explicit AoE flag as single-target;
      // need to verify which actions are AoE — volley, cleave, chain_lightning, meteor_strike)
      // For the test, let's use a custom AoE action
      const aoeAction: ActionDefinition = {
        id: 'test_aoe',
        name: 'AoE Blast',
        description: 'Hits all mobs',
        actionType: 'damage_spell',
        category: 'offensive',
        cost: { stamina: 0, mana: 10 },
        damageMultiplier: 1.0,
        damageType: 'magic',
        // We mark as AoE via the isAoe convention — but looking at the type,
        // there's no isAoe field. The task says AoE is determined by action.
        // Let me check: "Single-target: find mob with lowest HP"
        // "AoE: target all surviving mobs"
        // The choice between single/AoE depends on the action definition.
        // In the existing system, cleave/volley/chain_lightning/meteor_strike are AoE.
        // But there's no explicit isAoe flag on ActionDefinition.
        // I'll use the convention that certain actionTypes or specific IDs are AoE.
      };

      // Actually, based on the task description:
      // "Players auto-target lowest HP mob (single-target) or all mobs (AoE)"
      // The codebase uses specific action IDs for AoE. Let me use volley which is a known AoE.
      const p1 = makeParticipant({
        playerId: 'p1',
        template: [{ actionId: 'volley', sortOrder: 0 }],
        actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
      });
      const mob1 = makeMob({ id: 'mob1', hp: 80 });
      const mob2 = makeMob({ id: 'mob2', hp: 80 });
      const mob3 = makeMob({ id: 'mob3', hp: 80 });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1, mob2, mob3] }),
        alwaysHitRng,
      );

      // All mobs should have taken damage
      const totalDamage = result.participantResults[0].damageDealt;
      expect(totalDamage).toBeGreaterThan(0);

      // All mobs should have reduced HP
      for (const mob of result.mobsAfter) {
        expect(mob.hp).toBeLessThan(80);
      }
    });
  });

  describe('dead mob removal', () => {
    it('mob killed mid-round is removed from mobsAfter', () => {
      const p1 = makeParticipant({
        playerId: 'p1',
        stats: makeStats({ damageMin: 200, damageMax: 200 }),
      });
      const mob1 = makeMob({ id: 'mob1', hp: 5 }); // will die
      const mob2 = makeMob({ id: 'mob2', hp: 80 });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1, mob2] }),
        alwaysHitRng,
      );

      // mob1 should not be in mobsAfter (was killed)
      const mobIds = result.mobsAfter.map(m => m.id);
      expect(mobIds).not.toContain('mob1');
      expect(mobIds).toContain('mob2');
    });
  });

  describe('room cleared', () => {
    it('all mobs die results in roomCleared: true', () => {
      const p1 = makeParticipant({
        playerId: 'p1',
        stats: makeStats({ damageMin: 200, damageMax: 200 }),
      });
      const mob1 = makeMob({ id: 'mob1', hp: 5 });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1] }),
        alwaysHitRng,
      );

      expect(result.roomCleared).toBe(true);
      expect(result.mobsAfter).toHaveLength(0);
    });
  });

  describe('all players dead', () => {
    it('all players KO\'d results in allPlayersDead: true', () => {
      const p1 = makeParticipant({ playerId: 'p1', hp: 1, maxHp: 100 });
      const p2 = makeParticipant({ playerId: 'p2', hp: 1, maxHp: 100 });
      const mob1 = makeMob({
        id: 'mob1',
        stats: makeStats({ damageMin: 100, damageMax: 100 }),
        actionTemplate: [{ actionId: 'boss_earthquake', targetMode: 'aoe' }],
      });

      const result = resolveRaidRound(
        makeInput({ participants: [p1, p2], mobs: [mob1] }),
        alwaysHitRng,
      );

      expect(result.allPlayersDead).toBe(true);
    });
  });

  describe('threat-based mob targeting', () => {
    it('mobs attack highest-threat player', () => {
      const p1 = makeParticipant({ playerId: 'tank', hp: 200, maxHp: 200, template: [{ actionId: 'defend', sortOrder: 0 }] });
      const p2 = makeParticipant({ playerId: 'dps', hp: 200, maxHp: 200, template: [{ actionId: 'defend', sortOrder: 0 }] });
      const threatTable = initThreatTable(['tank', 'dps']);
      threatTable[0].threat = 500; // tank has more threat
      threatTable[1].threat = 100;

      const mob1 = makeMob({ id: 'mob1' });

      const result = resolveRaidRound(
        makeInput({ participants: [p1, p2], mobs: [mob1], threatTable }),
        alwaysHitRng,
      );

      // Mob should have targeted the tank
      expect(result.mobActionResults[0].targetPlayerIds).toContain('tank');
      const tankResult = result.participantResults.find(r => r.playerId === 'tank')!;
      expect(tankResult.damageTaken).toBeGreaterThan(0);
    });
  });

  describe('counter avoids physical', () => {
    it('player countering takes no damage from physical mob attack', () => {
      const p1 = makeParticipant({
        playerId: 'p1',
        hp: 200,
        maxHp: 200,
        template: [{ actionId: 'counter', sortOrder: 0 }],
        stamina: 100,
      });
      const mob1 = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
      });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1] }),
        alwaysHitRng,
      );

      expect(result.participantResults[0].damageTaken).toBe(0);
    });
  });

  describe('ward avoids magic', () => {
    it('player warding resists magic mob attack', () => {
      const p1 = makeParticipant({
        playerId: 'p1',
        hp: 200,
        maxHp: 200,
        template: [{ actionId: 'ward', sortOrder: 0 }],
        mana: 100,
      });
      const mob1 = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_magic_attack', targetMode: 'single_target' }],
      });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1] }),
        alwaysHitRng,
      );

      expect(result.participantResults[0].damageTaken).toBe(0);
    });
  });

  describe('multiple mob attacks', () => {
    it('3 mobs each attack independently (3 separate damage events)', () => {
      const p1 = makeParticipant({ playerId: 'p1', hp: 500, maxHp: 500 });
      const mob1 = makeMob({ id: 'mob1' });
      const mob2 = makeMob({ id: 'mob2' });
      const mob3 = makeMob({ id: 'mob3' });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1, mob2, mob3] }),
        alwaysHitRng,
      );

      // 3 mob action results
      expect(result.mobActionResults).toHaveLength(3);
      expect(result.mobActionResults[0].mobId).toBe('mob1');
      expect(result.mobActionResults[1].mobId).toBe('mob2');
      expect(result.mobActionResults[2].mobId).toBe('mob3');

      // Each dealt damage
      for (const mar of result.mobActionResults) {
        expect(mar.damageDealt).toBeGreaterThan(0);
      }

      // Player took cumulative damage from all 3
      expect(result.participantResults[0].damageTaken).toBeGreaterThan(0);
    });
  });

  describe('environmental DoT', () => {
    it('all players take % max HP damage when dot percent provided', () => {
      const p1 = makeParticipant({ playerId: 'p1', hp: 200, maxHp: 200, template: [{ actionId: 'defend', sortOrder: 0 }] });
      const p2 = makeParticipant({ playerId: 'p2', hp: 100, maxHp: 100, template: [{ actionId: 'defend', sortOrder: 0 }] });

      // Use a boss that does boss_rest (no damage) so we isolate the DoT
      const mob1 = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      });

      const result = resolveRaidRound(
        makeInput({
          participants: [p1, p2],
          mobs: [mob1],
          environmentalDotPercent: 0.1, // 10% max HP
        }),
        alwaysMissRng, // ensure mob misses so damage is only from DoT
      );

      // p1: 10% of 200 = 20 damage
      // p2: 10% of 100 = 10 damage
      expect(result.participantResults[0].damageTaken).toBe(20);
      expect(result.participantResults[0].hpAfter).toBe(180);
      expect(result.participantResults[1].damageTaken).toBe(10);
      expect(result.participantResults[1].hpAfter).toBe(90);
    });

    it('no damage when environmentalDotPercent is not provided', () => {
      const p1 = makeParticipant({ playerId: 'p1', hp: 200, maxHp: 200, template: [{ actionId: 'defend', sortOrder: 0 }] });
      const mob1 = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1] }),
        alwaysMissRng,
      );

      expect(result.participantResults[0].damageTaken).toBe(0);
    });
  });

  describe('resource deduction', () => {
    it('stamina/mana costs deducted, regen applied', () => {
      // normal_attack costs 15 stamina, 0 mana
      const p1 = makeParticipant({
        playerId: 'p1',
        stamina: 50, maxStamina: 100, staminaRegenPerRound: 10,
        mana: 20, maxMana: 50, manaRegenPerRound: 5,
        template: [{ actionId: 'normal_attack', sortOrder: 0 }],
      });
      const mob1 = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1] }),
        alwaysHitRng,
      );

      // 50 stamina - 20 (normal_attack cost) + 10 (regen) = 40
      expect(result.participantResults[0].staminaAfter).toBe(40);
      // 20 mana - 0 + 5 (regen) = 25
      expect(result.participantResults[0].manaAfter).toBe(25);
    });

    it('template round advances by 1', () => {
      const p1 = makeParticipant({ playerId: 'p1', templateRound: 3 });
      const result = resolveRaidRound(makeInput({ participants: [p1] }), alwaysHitRng);
      expect(result.participantResults[0].templateRoundAfter).toBe(4);
    });
  });

  describe('channeling vulnerability', () => {
    it('channeling player takes +50% damage from mob attacks', () => {
      // heavy_attack is channeling
      const pChannel = makeParticipant({
        playerId: 'pChannel',
        hp: 500, maxHp: 500,
        template: [{ actionId: 'heavy_attack', sortOrder: 0 }],
      });
      const pNormal = makeParticipant({
        playerId: 'pNormal',
        hp: 500, maxHp: 500,
        template: [{ actionId: 'normal_attack', sortOrder: 0 }],
      });

      const mob = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
      });

      const resultChannel = resolveRaidRound(
        makeInput({ participants: [pChannel], mobs: [mob] }),
        alwaysHitRng,
      );
      const resultNormal = resolveRaidRound(
        makeInput({ participants: [pNormal], mobs: [{ ...mob }] }),
        alwaysHitRng,
      );

      expect(resultChannel.participantResults[0].damageTaken).toBeGreaterThan(
        resultNormal.participantResults[0].damageTaken,
      );
    });
  });

  describe('defend reduces damage', () => {
    it('defending player takes reduced damage from mob', () => {
      const pDefend = makeParticipant({
        playerId: 'pDefend',
        hp: 500, maxHp: 500,
        template: [{ actionId: 'defend', sortOrder: 0 }],
      });
      const pNormal = makeParticipant({
        playerId: 'pNormal',
        hp: 500, maxHp: 500,
        template: [{ actionId: 'normal_attack', sortOrder: 0 }],
      });

      const mob = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
      });

      const resultDefend = resolveRaidRound(
        makeInput({ participants: [pDefend], mobs: [mob] }),
        alwaysHitRng,
      );
      const resultNormal = resolveRaidRound(
        makeInput({ participants: [pNormal], mobs: [{ ...mob }] }),
        alwaysHitRng,
      );

      expect(resultDefend.participantResults[0].damageTaken).toBeLessThan(
        resultNormal.participantResults[0].damageTaken,
      );
    });
  });

  describe('supportive actions', () => {
    it('heal_self restores own HP', () => {
      const p1 = makeParticipant({
        playerId: 'p1',
        hp: 50, maxHp: 100,
        mana: 100, maxMana: 100,
        template: [{ actionId: 'minor_heal', sortOrder: 0 }],
      });
      const mob1 = makeMob({
        id: 'mob1',
        actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      });

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1] }),
        alwaysHitRng,
      );

      expect(result.participantResults[0].healingDone).toBeGreaterThan(0);
      expect(result.participantResults[0].hpAfter).toBeGreaterThan(50);
    });
  });

  describe('mob death prevents mob attack', () => {
    it('dead mob does not attack', () => {
      const p1 = makeParticipant({
        playerId: 'p1',
        hp: 200, maxHp: 200,
        stats: makeStats({ damageMin: 200, damageMax: 200 }),
      });
      const mob1 = makeMob({ id: 'mob1', hp: 5 }); // will be killed by player

      const result = resolveRaidRound(
        makeInput({ participants: [p1], mobs: [mob1] }),
        alwaysHitRng,
      );

      // Mob was killed, should not have attacked
      expect(result.participantResults[0].damageTaken).toBe(0);
      expect(result.roomCleared).toBe(true);
    });
  });
});
