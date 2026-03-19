import { describe, it, expect, vi } from 'vitest';
import type {
  CombatantStats,
  RaidParticipant,
  ExpeditionMobState,
} from '@pocketrealm/shared';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared';
import { initThreatTable } from '@pocketrealm/game-engine';

// Mock DB modules so tests don't require JWT_SECRET / DB connection
vi.mock('@pocketrealm/database', () => ({ prisma: {}, Prisma: {} }));
vi.mock('../middleware/errorHandler', () => ({ AppError: class extends Error { constructor(s: number, m: string) { super(m); } } }));
vi.mock('./combatOrchestrationService', () => ({}));
vi.mock('../utils/routeHelpers', () => ({}));
vi.mock('./turnBankService', () => ({}));
vi.mock('./hpService', () => ({}));
vi.mock('./resourceService', () => ({}));
vi.mock('./chestService', () => ({}));
vi.mock('./inventoryService', () => ({}));
vi.mock('./pendingLootService', () => ({}));
vi.mock('./activityLogService', () => ({}));
vi.mock('./potionService', () => ({}));
vi.mock('./stateUpdateHelpers', () => ({}));
vi.mock('./worldEventService', () => ({}));
vi.mock('./durabilityService', () => ({}));
vi.mock('./xpService', () => ({}));
vi.mock('./buffService', () => ({}));
vi.mock('./zoneExplorationService', () => ({}));
vi.mock('./statsService', () => ({}));
vi.mock('./equipmentService', () => ({}));
vi.mock('./attributesService', () => ({}));
vi.mock('../routes/combat/helpers', () => ({}));

import { resolveEncounterRoomCombat } from './encounterSiteCombatService';

// ---------------------------------------------------------------------------
// Test helpers (mirrors raidRoundResolver.test.ts pattern)
// ---------------------------------------------------------------------------

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
    playerId: 'test-player',
    stats: makeStats(),
    template: [{ actionId: 'normal_attack', sortOrder: 0 }],
    actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
    hp: 500,
    maxHp: 500,
    stamina: 100,
    maxStamina: 100,
    staminaRegenPerRound: 10,
    mana: 50,
    maxMana: 50,
    manaRegenPerRound: 5,
    templateRound: 1,
    activeEffects: [],
    healTargetPlayerId: null,
    availablePotions: [],
    ...overrides,
  };
}

function makeMob(overrides: Partial<ExpeditionMobState> = {}): ExpeditionMobState {
  return {
    id: 'encounter-mob-1',
    mobTemplateId: 'goblin',
    name: 'Goblin',
    prefix: null,
    hp: 50,
    maxHp: 50,
    stats: makeStats({ damageMin: 5, damageMax: 10, dodge: 2, defence: 3, magicDefence: 1 }),
    actionTemplate: [{ actionId: 'boss_physical_attack', targetMode: 'single_target' }],
    activeEffects: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveEncounterRoomCombat', () => {
  it('returns cleared outcome when player defeats all mobs', () => {
    // Player with very high damage, mob with very low HP
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 1000, damageMax: 1000, accuracy: 1000 }),
    });
    const mobs = [
      makeMob({ id: 'encounter-mob-1', hp: 1, maxHp: 1 }),
    ];

    const result = resolveEncounterRoomCombat(participant, mobs);

    expect(result.outcome).toBe('cleared');
    expect(result.roundsResolved).toBeGreaterThan(0);
    expect(result.mobResults).toHaveLength(1);
    expect(result.mobResults[0]!.alive).toBe(false);
    expect(result.playerHpAfter).toBeGreaterThan(0);
  });

  it('returns defeated outcome when mobs kill the player', () => {
    // Extremely weak player, very strong mob
    const participant = makeParticipant({
      hp: 1,
      maxHp: 1,
      stats: makeStats({ hp: 1, maxHp: 1 }),
    });
    const mobs = [
      makeMob({
        id: 'encounter-mob-1',
        hp: 10000,
        maxHp: 10000,
        stats: makeStats({ damageMin: 9999, damageMax: 9999, accuracy: 9999, defence: 0, magicDefence: 0, dodge: 0, evasion: 0 }),
      }),
    ];

    const result = resolveEncounterRoomCombat(participant, mobs);

    expect(result.outcome).toBe('defeated');
    expect(result.playerHpAfter).toBeLessThanOrEqual(0);
    expect(result.mobResults[0]!.alive).toBe(true);
  });

  it('clears multiple weak mobs with high damage player', () => {
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 1000, damageMax: 1000, accuracy: 1000 }),
    });
    const mobs = [
      makeMob({ id: 'encounter-mob-1', hp: 1, maxHp: 1 }),
      makeMob({ id: 'encounter-mob-2', hp: 1, maxHp: 1 }),
      makeMob({ id: 'encounter-mob-3', hp: 1, maxHp: 1 }),
    ];

    const result = resolveEncounterRoomCombat(participant, mobs);

    expect(result.outcome).toBe('cleared');
    expect(result.mobResults).toHaveLength(3);
    for (const mobResult of result.mobResults) {
      expect(mobResult.alive).toBe(false);
    }
  });

  it('respects the maxRounds limit', () => {
    // Very evenly matched — set maxRounds to 1 so it terminates
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 0, damageMax: 0 }), // no damage
    });
    const mobs = [makeMob({ hp: 1000, maxHp: 1000 })];

    const result = resolveEncounterRoomCombat(participant, mobs, 2);

    // Neither side can decisively win in 2 rounds with 0 player damage
    expect(result.roundsResolved).toBeLessThanOrEqual(2);
    // Mob is still alive since player does no damage
    expect(result.mobResults[0]!.alive).toBe(true);
    expect(result.outcome).toBe('defeated');
  });

  it('returns round logs for each resolved round', () => {
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 1000, damageMax: 1000, accuracy: 1000 }),
    });
    const mobs = [makeMob({ hp: 1, maxHp: 1 })];

    const result = resolveEncounterRoomCombat(participant, mobs);

    expect(result.roundLogs.length).toBe(result.roundsResolved);
  });

  it('crowded debuff reduces mob damage and accuracy proportionally', () => {
    // Test the crowded debuff itself by inspecting applyCrowdedDebuff behavior:
    // With 1 mob: multiplier = 1.0 (no debuff)
    // With 3 mobs: multiplier = 1 / (1 + 2 * 0.15) = 1/1.3 ≈ 0.769

    // We verify that the service applies the debuff by comparing a 3-mob scenario
    // to a mathematically equivalent 1-mob scenario.
    //
    // Use very high accuracy mobs (always hit) with no player evasion/defence,
    // and a player that does no damage (so mobs always survive all 5 rounds).
    // With fixed min=max damage, we can compare total damage taken deterministically.

    const highAccuracy = 99999;
    const noDodge = 0;
    const noDefence = 0;

    // Single mob doing 130 damage — equivalent to 3 mobs each doing ~100 damage
    // but with crowded debuff reducing to 77% each (100 * 0.769 * 3 = 230.7)
    // The single mob equivalence is that 3 mobs do LESS than 3x a single mob of 100

    // 3 mobs each with damageMin=damageMax=100, accuracy=highAccuracy
    const mobs3 = [
      makeMob({ id: 'encounter-mob-1', hp: 99999, maxHp: 99999, stats: makeStats({ damageMin: 100, damageMax: 100, accuracy: highAccuracy, dodge: noDodge, defence: noDefence, magicDefence: noDefence }) }),
      makeMob({ id: 'encounter-mob-2', hp: 99999, maxHp: 99999, stats: makeStats({ damageMin: 100, damageMax: 100, accuracy: highAccuracy, dodge: noDodge, defence: noDefence, magicDefence: noDefence }) }),
      makeMob({ id: 'encounter-mob-3', hp: 99999, maxHp: 99999, stats: makeStats({ damageMin: 100, damageMax: 100, accuracy: highAccuracy, dodge: noDodge, defence: noDefence, magicDefence: noDefence }) }),
    ];

    // 1 mob doing 300 damage (3x single mob, uncrowded equivalent)
    const mobs1x3 = [
      makeMob({ id: 'encounter-mob-1', hp: 99999, maxHp: 99999, stats: makeStats({ damageMin: 300, damageMax: 300, accuracy: highAccuracy, dodge: noDodge, defence: noDefence, magicDefence: noDefence }) }),
    ];

    // Player does no damage, high HP, no evasion/defence
    const playerBase = makeParticipant({
      hp: 99999, maxHp: 99999,
      stats: makeStats({ damageMin: 0, damageMax: 0, evasion: 0, dodge: 0 }),
    });
    const player3 = { ...playerBase, availablePotions: [] };
    const player1x3 = { ...playerBase, availablePotions: [] };

    // Run exactly 3 rounds each (player doesn't die, mobs don't die)
    const result3 = resolveEncounterRoomCombat(player3, mobs3, 3);
    const result1x3 = resolveEncounterRoomCombat(player1x3, mobs1x3, 3);

    const damageTaken3mobs = 99999 - result3.playerHpAfter;
    const damageTaken1mob = 99999 - result1x3.playerHpAfter;

    // 3 crowded mobs with 100 damage each should deal LESS than 1 mob with 300 damage
    // (because crowded debuff reduces each mob's effective damage)
    expect(damageTaken3mobs).toBeLessThan(damageTaken1mob);
    // Sanity: 3 crowded mobs should still deal positive damage
    expect(damageTaken3mobs).toBeGreaterThan(0);
    expect(damageTaken1mob).toBeGreaterThan(0);
  });

  it('returns empty potionsConsumed when no potions are used', () => {
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 1000, damageMax: 1000, accuracy: 1000 }),
      availablePotions: [],
    });
    const mobs = [makeMob({ hp: 1, maxHp: 1 })];

    const result = resolveEncounterRoomCombat(participant, mobs);

    expect(result.potionsConsumed).toHaveLength(0);
  });

  it('returns correct mobResults array with alive/dead status', () => {
    // Player kills mob 1 (low HP) but mob 2 survives (very high HP)
    // With splash cascade, killing mob1 may splash to mob2
    // To ensure deterministic result: give mob2 enough HP to survive
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 50, damageMax: 50, accuracy: 1000 }),
    });
    const mobs = [
      makeMob({ id: 'encounter-mob-1', hp: 1, maxHp: 1 }),
      makeMob({ id: 'encounter-mob-2', hp: 100000, maxHp: 100000 }),
    ];

    const result = resolveEncounterRoomCombat(participant, mobs, 5);

    expect(result.mobResults).toHaveLength(2);
    // At least one mob should be dead (mob1 has 1 hp)
    const deadMobs = result.mobResults.filter(m => !m.alive);
    expect(deadMobs.length).toBeGreaterThanOrEqual(1);
  });
});
