import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import type {
  CombatantStats,
  RaidParticipant,
  RaidParticipantResult,
  ExpeditionMobState,
  ExpeditionRoundLog,
  EffectTickEntry,
  PlayerAttackEntry,
  EncounterMobSlot,
} from '@pocketrealm/shared';
import { makeEncounterMobId } from '@pocketrealm/shared';
import { initThreatTable } from '@pocketrealm/game-engine';

const databaseMocks = vi.hoisted(() => {
  const tx = {
    encounterSite: {
      findFirst: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    activityLog: {
      create: vi.fn(),
    },
  };
  return {
    tx,
    prisma: {
      encounterSite: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      mobTemplate: {
        findMany: vi.fn(),
      },
      mobFamily: {
        findUnique: vi.fn(),
      },
      player: {
        update: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

const redisMock = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

const combatOrchestrationMocks = vi.hoisted(() => ({
  fetchFreshTemplateData: vi.fn(),
  preparePlayerForCombat: vi.fn(),
  applyGuildCombatModifiers: vi.fn(),
  splitAndGrantXp: vi.fn(),
}));

const guardMocks = vi.hoisted(() => ({
  assertCanAct: vi.fn(),
  assertInZone: vi.fn(),
  handleCombatDefeat: vi.fn(),
}));

const potionMocks = vi.hoisted(() => ({
  templateHasPotionActions: vi.fn(),
  buildPotionPool: vi.fn(),
}));

const worldEventMocks = vi.hoisted(() => ({
  getActiveEventsForZone: vi.fn(),
  getActiveWorldWideEvents: vi.fn(),
  computeZoneModifiers: vi.fn(),
}));

const progressMocks = vi.hoisted(() => ({
  trackProgress: vi.fn(),
}));

const routeHelperMocks = vi.hoisted(() => ({
  parseEncounterSiteMobs: vi.fn(),
  serializeEncounterSiteMobs: vi.fn(),
  countEncounterSiteState: vi.fn(),
  getNextUnfinishedRoom: vi.fn(),
  getAllAliveMobsInRoom: vi.fn(),
  applyEncounterSiteDecayAndPersist: vi.fn(),
  applyEncounterSiteDecayInMemory: vi.fn(),
}));

const serviceMocks = vi.hoisted(() => ({
  spendPlayerTurnsTx: vi.fn(),
  setAllResources: vi.fn(),
  getHpState: vi.fn(),
  grantEncounterSiteChestRewardsTx: vi.fn(),
  getInventoryState: vi.fn(),
  deductConsumedPotions: vi.fn(),
  degradeEquippedDurabilityByHits: vi.fn(),
  getEquipmentStats: vi.fn(),
  getPlayerProgressionState: vi.fn(),
  storePendingLoot: vi.fn(),
}));

// Mock DB modules so tests don't require JWT_SECRET / DB connection
vi.mock('@pocketrealm/database', () => ({ prisma: databaseMocks.prisma, Prisma: {} }));
vi.mock('../redis', () => ({ redis: redisMock }));
vi.mock('../middleware/errorHandler', () => ({ AppError: class extends Error { constructor(s: number, m: string) { super(m); } } }));
vi.mock('./combatOrchestrationService', () => combatOrchestrationMocks);
vi.mock('./progressService', () => progressMocks);
vi.mock('../utils/routeHelpers', () => guardMocks);
vi.mock('./turnBankService', () => ({ spendPlayerTurnsTx: serviceMocks.spendPlayerTurnsTx }));
vi.mock('./hpService', () => ({ getHpState: serviceMocks.getHpState }));
vi.mock('./resourceService', () => ({ setAllResources: serviceMocks.setAllResources }));
vi.mock('./chestService', () => ({ grantEncounterSiteChestRewardsTx: serviceMocks.grantEncounterSiteChestRewardsTx }));
vi.mock('./inventoryService', () => ({ getInventoryState: serviceMocks.getInventoryState }));
vi.mock('./pendingLootService', () => ({ storePendingLoot: serviceMocks.storePendingLoot }));
vi.mock('./activityLogService', () => ({}));
vi.mock('./potionService', () => ({
  deductConsumedPotions: serviceMocks.deductConsumedPotions,
  templateHasPotionActions: potionMocks.templateHasPotionActions,
  buildPotionPool: potionMocks.buildPotionPool,
}));
vi.mock('./stateUpdateHelpers', () => ({}));
vi.mock('./worldEventService', () => worldEventMocks);
vi.mock('./durabilityService', () => ({ degradeEquippedDurabilityByHits: serviceMocks.degradeEquippedDurabilityByHits }));
vi.mock('./xpService', () => ({}));
vi.mock('./buffService', () => ({}));
vi.mock('./zoneExplorationService', () => ({}));
vi.mock('./statsService', () => ({}));
vi.mock('./equipmentService', () => ({ getEquipmentStats: serviceMocks.getEquipmentStats }));
vi.mock('./attributesService', () => ({ getPlayerProgressionState: serviceMocks.getPlayerProgressionState }));
vi.mock('./combat/helpers', () => routeHelperMocks);

import {
  resolveEncounterRoomCombat,
  computeDefeatedMobXp,
  accumulateEncounterSiteXpContribution,
  rebuildEncounterSiteXpContributionsFromRoundLogs,
  createEncounterSiteXpContributions,
  autoResolveEncounterRoom,
  resolveManualEncounterRound,
} from './encounterSiteCombatService';
import { countDefeatedPromotedEncounterRoles } from './encounterSiteCombatCore';
import { trackEncounterSiteKillProgress } from './encounterSiteProgressService';

beforeEach(() => {
  vi.resetAllMocks();
  databaseMocks.prisma.$transaction.mockImplementation(async (callback) => callback(databaseMocks.tx));
  databaseMocks.prisma.mobFamily.findUnique.mockResolvedValue({ name: 'Goblins' });
  routeHelperMocks.parseEncounterSiteMobs.mockImplementation((mobs) => mobs);
  routeHelperMocks.serializeEncounterSiteMobs.mockImplementation((mobs) => mobs);
  routeHelperMocks.countEncounterSiteState.mockImplementation((mobs) => ({
    alive: mobs.filter((mob: { status: string }) => mob.status === 'alive').length,
  }));
  routeHelperMocks.getNextUnfinishedRoom.mockReturnValue(2);
  routeHelperMocks.getAllAliveMobsInRoom.mockImplementation((mobs, room) =>
    mobs.filter((mob: { room?: number; status: string }) => (mob.room ?? 1) === room && mob.status === 'alive'),
  );
  routeHelperMocks.applyEncounterSiteDecayAndPersist.mockImplementation(async (site) => ({ mobs: site.mobs }));
  routeHelperMocks.applyEncounterSiteDecayInMemory.mockImplementation((mobs) => ({ mobs }));
  guardMocks.assertCanAct.mockResolvedValue({ currentHp: 100, maxHp: 100 });
  guardMocks.assertInZone.mockResolvedValue(undefined);
  guardMocks.handleCombatDefeat.mockResolvedValue({ fleeResult: null, respawnedTo: null });
  potionMocks.templateHasPotionActions.mockReturnValue(false);
  potionMocks.buildPotionPool.mockResolvedValue([]);
  worldEventMocks.getActiveEventsForZone.mockResolvedValue([]);
  worldEventMocks.getActiveWorldWideEvents.mockResolvedValue([]);
  worldEventMocks.computeZoneModifiers.mockReturnValue({ mobHpMultiplier: 1, mobDamageMultiplier: 1 });
  serviceMocks.spendPlayerTurnsTx.mockResolvedValue({ spent: 1 });
  serviceMocks.setAllResources.mockResolvedValue(undefined);
  serviceMocks.getInventoryState.mockResolvedValue({ availableSlots: 10 });
  serviceMocks.deductConsumedPotions.mockResolvedValue({ deducted: [] });
  serviceMocks.degradeEquippedDurabilityByHits.mockResolvedValue([]);
  serviceMocks.getEquipmentStats.mockResolvedValue(makeEquipmentStats());
  serviceMocks.getPlayerProgressionState.mockResolvedValue(makeProgression());
  serviceMocks.grantEncounterSiteChestRewardsTx.mockResolvedValue({
    chestRarity: 'common',
    materialRolls: 0,
    loot: [],
    recipeUnlocked: null,
    overflow: [],
    slotsConsumed: 0,
    newItemIds: [],
    updatedItemIds: [],
  });
  serviceMocks.storePendingLoot.mockResolvedValue('pending-session-1');
  combatOrchestrationMocks.preparePlayerForCombat.mockResolvedValue(makeCombatPrep());
  combatOrchestrationMocks.applyGuildCombatModifiers.mockReturnValue(undefined);
  combatOrchestrationMocks.splitAndGrantXp.mockResolvedValue([]);
  progressMocks.trackProgress.mockResolvedValue([]);
  redisMock.del.mockResolvedValue(1);
});

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

function makeEquipmentStats(overrides: Partial<{
  attack: number;
  rangedPower: number;
  magicPower: number;
  accuracy: number;
  armor: number;
  magicDefence: number;
  health: number;
  dodge: number;
  luck: number;
  critChance: number;
  critDamage: number;
  inventorySlots: number;
}> = {}) {
  return {
    attack: 1000,
    rangedPower: 0,
    magicPower: 0,
    accuracy: 1000,
    armor: 0,
    magicDefence: 0,
    health: 0,
    dodge: 0,
    luck: 0,
    critChance: 0,
    critDamage: 0,
    inventorySlots: 0,
    ...overrides,
  };
}

function makeProgression(attributes = { vitality: 0, strength: 100, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 }) {
  return {
    characterXp: 0,
    characterLevel: 1,
    attributePoints: 0,
    attributes,
  };
}

function makeCombatPrep(overrides: {
  attackLevel?: number;
  progression?: ReturnType<typeof makeProgression>;
  equipmentStats?: ReturnType<typeof makeEquipmentStats>;
} = {}) {
  return {
    attackSkill: 'melee',
    attackLevel: overrides.attackLevel ?? 100,
    progression: overrides.progression ?? makeProgression(),
    equipmentStats: overrides.equipmentStats ?? makeEquipmentStats(),
    guildMods: { combatDamage: 0, defenseBoost: 0, xpBoost: 0 },
    perActionScaling: {},
    playerTemplate: [{ actionId: 'normal_attack', sortOrder: 0 }],
    potionPool: [],
    resources: {
      stamina: 100,
      maxStamina: 100,
      staminaRegenPerRound: 10,
      mana: 50,
      maxMana: 50,
      manaRegenPerRound: 5,
    },
    unlockedActions: [],
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

function makeEncounterSlot(slot: number, overrides: Partial<EncounterMobSlot> = {}): EncounterMobSlot {
  return {
    slot,
    mobTemplateId: 'goblin',
    role: 'trash',
    prefix: null,
    status: 'alive',
    room: 1,
    ...overrides,
  };
}

function mockAutoEncounterSite(
  playerId: string,
  siteId: string,
  siteMobs: EncounterMobSlot[],
  txMobs: EncounterMobSlot[] = siteMobs,
) {
  const discoveredAt = new Date('2026-01-01T00:00:00.000Z');
  databaseMocks.prisma.encounterSite.findFirst.mockResolvedValue({
    id: siteId,
    playerId,
    name: 'Test Site',
    zoneId: 'zone-1',
    mobFamilyId: 'family-1',
    discoveredAt,
    mobs: siteMobs,
    currentRoom: 1,
    totalRooms: 1,
    roomStrategy: [],
    mobFamily: { name: 'Goblins' },
    zone: { name: 'Test Zone' },
  });
  databaseMocks.tx.encounterSite.findFirst.mockResolvedValue({
    id: siteId,
    playerId,
    mobFamilyId: 'family-1',
    size: 'small',
    discoveredAt,
    mobs: txMobs,
    currentRoom: 1,
    totalRooms: 1,
    roomStrategy: [],
  });
  databaseMocks.prisma.mobTemplate.findMany.mockResolvedValue([{
    id: 'goblin',
    name: 'Goblin',
    hp: 1,
    zoneId: 'zone-1',
    level: 1,
    accuracy: 0,
    defence: 0,
    magicDefence: 0,
    evasion: 0,
    damageMin: 1,
    damageMax: 1,
    damageType: 'physical',
    xpReward: 20,
    encounterWeight: 1,
    spellPattern: [],
  }]);
}

function makeManualEncounterState(overrides: {
  playerId?: string;
  siteId?: string;
  currentRoom?: number;
  participant?: RaidParticipant;
  mobs?: ExpeditionMobState[];
  roomMobSlots?: EncounterMobSlot[];
  totalRooms?: number;
} = {}) {
  const playerId = overrides.playerId ?? 'test-player';
  const siteId = overrides.siteId ?? 'site-1';
  const roomMobSlots = overrides.roomMobSlots ?? [makeEncounterSlot(1)];
  const mobs = overrides.mobs ?? [
    makeMob({
      id: makeEncounterMobId(roomMobSlots[0]!.slot),
      hp: 10,
      maxHp: 10,
      stats: makeStats({ damageMin: 0, damageMax: 0, dodge: 0, defence: 0, magicDefence: 0 }),
      actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
    }),
  ];

  return {
    playerId,
    siteId,
    currentRoom: overrides.currentRoom ?? 1,
    participant: overrides.participant ?? makeParticipant({
      playerId,
      template: [{ actionId: 'defend', sortOrder: 0 }],
      actionDefinitions: { ...BASE_ACTION_DEFINITIONS },
      hp: 100,
      maxHp: 100,
      stats: makeStats({ damageMin: 0, damageMax: 0, accuracy: 1000 }),
    }),
    mobs,
    threatTable: initThreatTable([playerId]),
    roundNumber: 0,
    roundLogs: [],
    allPotionsConsumed: [],
    maxHp: 100,
    turnCostCharged: 1,
    totalRooms: overrides.totalRooms ?? 1,
    mobFamilyId: 'family-1',
    createdAt: Date.now(),
    siteName: 'Test Site',
    zoneId: 'zone-1',
    zoneName: 'Test Zone',
    mobFamilyName: 'Goblins',
    initialMobs: roomMobSlots.map(slot => ({
      mobId: makeEncounterMobId(slot.slot),
      slot: slot.slot,
      name: slot.prefix ? `${slot.prefix} Goblin` : 'Goblin',
      prefix: slot.prefix,
      role: slot.role,
      hp: 10,
      maxHp: 10,
    })),
    mobXpByEncounterMobId: { [makeEncounterMobId(roomMobSlots[0]!.slot)]: 20 },
    roomMobSlots,
    attackSkill: 'melee',
    guildXpBoost: 0,
    ...createEncounterSiteXpContributions(),
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

    expect(result.rounds.length).toBe(result.roundsResolved);
  });

  it('returns XP contribution maps for mixed action scaling stats', () => {
    const fireBolt = { ...BASE_ACTION_DEFINITIONS.fire_bolt!, alwaysHits: true };
    const aimedShot = { ...BASE_ACTION_DEFINITIONS.aimed_shot!, alwaysHits: true };
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 10, damageMax: 10, accuracy: 1000 }),
      template: [
        { actionId: fireBolt.id, sortOrder: 0 },
        { actionId: aimedShot.id, sortOrder: 1 },
      ],
      actionDefinitions: {
        ...BASE_ACTION_DEFINITIONS,
        [fireBolt.id]: fireBolt,
        [aimedShot.id]: aimedShot,
      },
      mana: 100,
      stamina: 100,
    });
    const mobs = [
      makeMob({
        hp: 100000,
        maxHp: 100000,
        stats: makeStats({ dodge: 0, defence: 0, magicDefence: 0, damageMin: 0, damageMax: 0 }),
        actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      }),
    ];

    const result = resolveEncounterRoomCombat(participant, mobs, 2, 'ranged');

    expect(result.damageByScalingStat.magic).toBeGreaterThan(0);
    expect(result.damageByScalingStat.ranged).toBeGreaterThan(0);
    expect(result.resourceCostByScalingStat).toEqual({
      melee: 0,
      ranged: aimedShot.cost.stamina + aimedShot.cost.mana,
      magic: fireBolt.cost.stamina + fireBolt.cost.mana,
    });
  });

  it('includes player-applied effect tick damage in XP contribution maps', () => {
    const magicDot = {
      ...BASE_ACTION_DEFINITIONS.fire_bolt!,
      id: 'test_magic_dot',
      name: 'Test Magic Dot',
      alwaysHits: true,
      damageMultiplier: 0.1,
      effect: {
        name: 'Arcane Burn',
        stat: 'attack',
        modifier: 0,
        duration: 2,
        isDebuff: true,
        damagePerRound: 10,
        dotDamageType: 'magic' as const,
      },
    };
    const participant = makeParticipant({
      stats: makeStats({ damageMin: 0, damageMax: 0, accuracy: 1000 }),
      template: [{ actionId: magicDot.id, sortOrder: 0 }],
      actionDefinitions: { ...BASE_ACTION_DEFINITIONS, [magicDot.id]: magicDot },
      mana: 100,
    });
    const mobs = [
      makeMob({
        hp: 50,
        maxHp: 50,
        stats: makeStats({ dodge: 0, defence: 0, magicDefence: 0, damageMin: 0, damageMax: 0 }),
        actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
      }),
    ];

    const result = resolveEncounterRoomCombat(participant, mobs, 1, 'melee');
    const tickDamage = result.rounds[0]!.log.phases.effectTicks
      .filter((tick) => tick.targetType === 'mob')
      .reduce((total, tick) => total + tick.damage, 0);
    const directDamage = result.rounds[0]!.log.phases.playerAttacks
      .filter((entry): entry is PlayerAttackEntry => 'hit' in entry)
      .reduce((total, entry) => total + (entry.totalDamage ?? 0), 0);

    expect(tickDamage).toBeGreaterThan(0);
    expect(result.damageByScalingStat.magic).toBe(directDamage + tickDamage);
    expect(result.damageByScalingStat.melee).toBe(0);
    expect(result.damageByScalingStat.ranged).toBe(0);
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

// ---------------------------------------------------------------------------
// computeDefeatedMobXp
// ---------------------------------------------------------------------------

describe('computeDefeatedMobXp', () => {
  const makeSlot = (
    slot: number,
    mobTemplateId: string,
    overrides: Partial<EncounterMobSlot> = {},
  ): EncounterMobSlot => ({
    slot, mobTemplateId, role: 'trash', prefix: null, status: 'alive', room: 1, ...overrides,
  });

  it('returns 0 when no mobs defeated', () => {
    const defeated = new Set<string>();
    const slots = [makeSlot(0, 'mob-a')];
    const xpMap = { [makeEncounterMobId(0)]: 10 };
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(0);
  });

  it('sums per-encounter-mob XP for defeated mobs only', () => {
    const defeated = new Set(['encounter-mob-0', 'encounter-mob-1']);
    const slots = [makeSlot(0, 'mob-a'), makeSlot(1, 'mob-b'), makeSlot(2, 'mob-a')];
    const xpMap = {
      [makeEncounterMobId(0)]: 10,
      [makeEncounterMobId(1)]: 20,
      [makeEncounterMobId(2)]: 30,
    };
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(30);
  });

  it('uses pre-scaled per-mob XP without applying prefix a second time', () => {
    const defeated = new Set(['encounter-mob-0']);
    const slots = [makeSlot(0, 'mob-a', { prefix: 'tough' })];
    const xpMap = { [makeEncounterMobId(0)]: 13 };
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(13);
  });

  it('returns 0 for missing encounter mob ID', () => {
    const defeated = new Set(['encounter-mob-0']);
    const slots = [makeSlot(0, 'unknown-mob')];
    const xpMap = {};
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(0);
  });

  it('supports different XP values for the same template used with different roles', () => {
    const defeated = new Set(['encounter-mob-0', 'encounter-mob-1']);
    const slots = [
      makeSlot(0, 'mob-a', { role: 'trash' }),
      makeSlot(1, 'mob-a', { role: 'elite', prefix: 'gigantic' }),
    ];
    const xpMap = {
      [makeEncounterMobId(0)]: 15,
      [makeEncounterMobId(1)]: 42,
    };
    expect(computeDefeatedMobXp(defeated, slots, xpMap)).toBe(57);
  });
});

describe('countDefeatedPromotedEncounterRoles', () => {
  it('counts only defeated elite and mini-boss mobs', () => {
    const mobs: EncounterMobSlot[] = [
      makeEncounterSlot(1, { role: 'elite', status: 'defeated' }),
      makeEncounterSlot(2, { role: 'mini_boss', status: 'defeated' }),
      makeEncounterSlot(3, { role: 'mini_boss', status: 'defeated' }),
      makeEncounterSlot(4, { role: 'elite', status: 'alive' }),
      makeEncounterSlot(5, { role: 'mini_boss', status: 'decayed' }),
      makeEncounterSlot(6, { role: 'trash', status: 'defeated' }),
    ];

    expect(countDefeatedPromotedEncounterRoles(mobs)).toEqual({
      elite: 1,
      mini_boss: 2,
    });
  });
});

describe('accumulateEncounterSiteXpContribution', () => {
  function makeParticipantResult(overrides: Partial<RaidParticipantResult>): RaidParticipantResult {
    return {
      playerId: 'test-player',
      actionId: 'normal_attack',
      targetMobId: 'encounter-mob-1',
      wasExhausted: false,
      damageDealt: 0,
      healingDone: 0,
      damageTaken: 0,
      hpAfter: 100,
      staminaAfter: 100,
      manaAfter: 100,
      templateRoundAfter: 2,
      isDead: false,
      hit: true,
      isCritical: false,
      activeEffectsAfter: [],
      potionsConsumed: [],
      ...overrides,
    };
  }

  it('attributes explicit encounter-site action contributions by action scaling stat', () => {
    const contributions = createEncounterSiteXpContributions();
    const fireBolt = BASE_ACTION_DEFINITIONS.fire_bolt!;
    const aimedShot = BASE_ACTION_DEFINITIONS.aimed_shot!;

    accumulateEncounterSiteXpContribution(
      contributions,
      makeParticipantResult({ actionId: fireBolt.id, damageDealt: 30 }),
      BASE_ACTION_DEFINITIONS,
      'ranged',
    );
    accumulateEncounterSiteXpContribution(
      contributions,
      makeParticipantResult({ actionId: aimedShot.id, damageDealt: 5 }),
      BASE_ACTION_DEFINITIONS,
      'ranged',
    );

    expect(contributions.damageByScalingStat).toEqual({ melee: 0, ranged: 5, magic: 30 });
    expect(contributions.resourceCostByScalingStat).toEqual({
      melee: 0,
      ranged: aimedShot.cost.stamina + aimedShot.cost.mana,
      magic: fireBolt.cost.stamina + fireBolt.cost.mana,
    });
  });

  it('uses fallback skill for weapon-scaled encounter-site actions', () => {
    const contributions = createEncounterSiteXpContributions();
    const normalAttack = BASE_ACTION_DEFINITIONS.normal_attack!;

    accumulateEncounterSiteXpContribution(
      contributions,
      makeParticipantResult({ actionId: normalAttack.id, damageDealt: 12 }),
      BASE_ACTION_DEFINITIONS,
      'ranged',
    );

    expect(contributions.damageByScalingStat).toEqual({ melee: 0, ranged: 12, magic: 0 });
    expect(contributions.resourceCostByScalingStat).toEqual({
      melee: 0,
      ranged: normalAttack.cost.stamina + normalAttack.cost.mana,
      magic: 0,
    });
  });
});

describe('rebuildEncounterSiteXpContributionsFromRoundLogs', () => {
  function makePlayerAttackEntry(
    actionId: string,
    actionLabel: string,
    staminaCost: number,
    manaCost: number,
    overrides: Partial<PlayerAttackEntry> = {},
  ): PlayerAttackEntry {
    return {
      playerId: 'test-player',
      username: 'Test',
      actionId,
      actionLabel,
      targetMobId: 'encounter-mob-1',
      targetMobName: 'Goblin',
      hitChance: 1,
      hitRollValue: 0,
      attackerHitScore: 100,
      defenderAvoidScore: 0,
      hit: true,
      crit: false,
      totalDamage: 0,
      staminaCost,
      manaCost,
      ...overrides,
    };
  }

  function makeRoundLog(
    round: number,
    playerAttacks: ExpeditionRoundLog['phases']['playerAttacks'],
    effectTicks: ExpeditionRoundLog['phases']['effectTicks'] = [],
  ): ExpeditionRoundLog {
    return {
      round,
      roomIndex: 1,
      phases: {
        playerAttacks,
        defences: [],
        mobActions: [],
        healing: [],
        effectTicks,
        outcome: {
          mobsAlive: 1,
          mobsKilled: 0,
          playersAlive: 1,
          playersKnockedOut: 0,
          roomCleared: false,
          wipe: false,
        },
      },
      telegraphs: [],
    };
  }

  it('rebuilds old manual-session damage and counts action resource cost once per round', () => {
    const fireBolt = BASE_ACTION_DEFINITIONS.fire_bolt!;
    const aimedShot = BASE_ACTION_DEFINITIONS.aimed_shot!;

    const contributions = rebuildEncounterSiteXpContributionsFromRoundLogs(
      [
        makeRoundLog(1, [
          makePlayerAttackEntry(
            fireBolt.id,
            fireBolt.name,
            fireBolt.cost.stamina,
            fireBolt.cost.mana,
            { totalDamage: 30 },
          ),
        ]),
        makeRoundLog(2, [
          makePlayerAttackEntry(
            aimedShot.id,
            aimedShot.name,
            aimedShot.cost.stamina,
            aimedShot.cost.mana,
            { totalDamage: 5 },
          ),
          makePlayerAttackEntry(
            aimedShot.id,
            aimedShot.name,
            aimedShot.cost.stamina,
            aimedShot.cost.mana,
            { targetMobId: 'encounter-mob-2', totalDamage: 7 },
          ),
        ]),
      ],
      BASE_ACTION_DEFINITIONS,
      'ranged',
    );

    expect(contributions.damageByScalingStat).toEqual({ melee: 0, ranged: 12, magic: 30 });
    expect(contributions.resourceCostByScalingStat).toEqual({
      melee: 0,
      ranged: aimedShot.cost.stamina + aimedShot.cost.mana,
      magic: fireBolt.cost.stamina + fireBolt.cost.mana,
    });
  });

  it('rebuilds player-applied effect tick damage by source scaling stat', () => {
    const fireBolt = BASE_ACTION_DEFINITIONS.fire_bolt!;
    const effectTicks = [{
      targetType: 'mob',
      targetId: 'encounter-mob-1',
      targetName: 'Goblin',
      effectName: 'Arcane Burn',
      damage: 9,
      damageType: 'magic',
      hpAfter: 41,
      sourceScalingStat: 'magic',
    }] as Array<EffectTickEntry & { sourceScalingStat: 'magic' }>;

    const contributions = rebuildEncounterSiteXpContributionsFromRoundLogs(
      [
        makeRoundLog(
          1,
          [
            makePlayerAttackEntry(
              fireBolt.id,
              fireBolt.name,
              fireBolt.cost.stamina,
              fireBolt.cost.mana,
              { totalDamage: 0 },
            ),
          ],
          effectTicks,
        ),
      ],
      BASE_ACTION_DEFINITIONS,
      'melee',
    );

    expect(contributions.damageByScalingStat).toEqual({ melee: 0, ranged: 0, magic: 9 });
    expect(contributions.resourceCostByScalingStat).toEqual({
      melee: 0,
      ranged: 0,
      magic: fireBolt.cost.stamina + fireBolt.cost.mana,
    });
  });
});

describe('trackEncounterSiteKillProgress', () => {
  it('batches encounter-site kills by total count, family, and prefix', async () => {
    const playerId = 'test-player';
    progressMocks.trackProgress.mockImplementation(async (_playerId, type, amount, metadata) => [{
      questId: metadata?.prefix ? `${type}-${metadata.prefix}` : type,
      questName: type,
      current: amount,
      target: 10,
      completed: false,
    }]);

    const result = await trackEncounterSiteKillProgress(playerId, [
      makeEncounterSlot(1, { prefix: 'savage' }),
      makeEncounterSlot(2, { prefix: 'savage' }),
      makeEncounterSlot(3, { prefix: 'ancient' }),
      makeEncounterSlot(4, { prefix: null }),
    ]);

    expect(progressMocks.trackProgress).toHaveBeenCalledTimes(4);
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_count', 4, undefined);
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_family', 4, undefined);
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_prefix', 2, { prefix: 'savage' });
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_prefix', 1, { prefix: 'ancient' });
    expect(result.map(update => update.questId)).toEqual([
      'kill_count',
      'kill_family',
      'kill_prefix-savage',
      'kill_prefix-ancient',
    ]);
  });
});

describe('autoResolveEncounterRoom', () => {
  it('tracks quest progress for newly defeated mobs when auto-clearing a room', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const roomMobs = [makeEncounterSlot(1, { prefix: 'savage' })];
    const killCountProgress = [{ questId: 'weekly-kills', questName: 'Weekly Bounty', current: 1, target: 75, completed: false }];
    const familyProgress = [{ questId: 'goblin-kills', questName: 'Goblin Cleanup', current: 1, target: 5, completed: false }];
    const prefixProgress = [{ questId: 'prefix-kills', questName: 'Hunt the savage', current: 1, target: 2, completed: false }];

    progressMocks.trackProgress
      .mockResolvedValueOnce(killCountProgress)
      .mockResolvedValueOnce(familyProgress)
      .mockResolvedValueOnce(prefixProgress);
    mockAutoEncounterSite(playerId, siteId, roomMobs);

    const result = await autoResolveEncounterRoom(playerId, siteId, 'Tester');

    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_count', 1, undefined);
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_family', 1, undefined);
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_prefix', 1, { prefix: 'savage' });
    expect(combatOrchestrationMocks.splitAndGrantXp).toHaveBeenCalledWith(
      playerId,
      20,
      'melee',
      expect.any(Object),
      expect.any(Object),
      0,
    );
    expect(result.questProgress).toEqual([
      ...killCountProgress,
      ...familyProgress,
      ...prefixProgress,
    ]);
  });

  it('does not track quest progress for a stale auto room finalization with no newly defeated DB mobs', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const staleRoomMobs = [makeEncounterSlot(1, { prefix: 'savage' })];
    const freshMobs = [makeEncounterSlot(1, { prefix: 'savage', status: 'defeated' })];
    mockAutoEncounterSite(playerId, siteId, staleRoomMobs, freshMobs);

    const result = await autoResolveEncounterRoom(playerId, siteId, 'Tester');

    expect(progressMocks.trackProgress).not.toHaveBeenCalled();
    expect(combatOrchestrationMocks.splitAndGrantXp).not.toHaveBeenCalled();
    expect(result.questProgress).toEqual([]);
  });

  it('does not track quest progress when auto-resolve ends in player defeat', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const roomMobs = [makeEncounterSlot(1, { prefix: 'savage' })];
    mockAutoEncounterSite(playerId, siteId, roomMobs);
    guardMocks.assertCanAct.mockResolvedValueOnce({ currentHp: 1, maxHp: 1 });
    combatOrchestrationMocks.preparePlayerForCombat.mockResolvedValueOnce(makeCombatPrep({
      attackLevel: 1,
      progression: makeProgression({ vitality: 0, strength: 0, dexterity: 0, intelligence: 0, luck: 0, evasion: 0 }),
      equipmentStats: makeEquipmentStats({ attack: 0, accuracy: 0 }),
    }));
    databaseMocks.prisma.mobTemplate.findMany.mockResolvedValueOnce([{
      id: 'goblin',
      name: 'Goblin',
      zoneId: 'zone-1',
      level: 1,
      hp: 100,
      accuracy: 1000,
      defence: 0,
      magicDefence: 0,
      evasion: 0,
      damageMin: 100,
      damageMax: 100,
      damageType: 'physical',
      xpReward: 20,
      encounterWeight: 1,
      spellPattern: [],
    }]);

    const result = await autoResolveEncounterRoom(playerId, siteId, 'Tester');

    expect(result.outcome).toBe('defeated');
    expect(progressMocks.trackProgress).not.toHaveBeenCalled();
    expect(combatOrchestrationMocks.splitAndGrantXp).not.toHaveBeenCalled();
    expect(result.questProgress).toEqual([]);
  });

  it('stores auto-resolved site chest overflow as pending loot', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const overflow = [{
      templateId: 'goblin-crown',
      templateName: "Goblin King's Crown",
      rarity: 'common',
      quantity: 1,
      bonusStats: null,
      currentDurability: 120,
      maxDurability: 120,
    }];
    mockAutoEncounterSite(playerId, siteId, [makeEncounterSlot(1)]);
    serviceMocks.grantEncounterSiteChestRewardsTx.mockResolvedValueOnce({
      chestRarity: 'common',
      materialRolls: 0,
      loot: [],
      recipeUnlocked: null,
      overflow,
      slotsConsumed: 0,
      newItemIds: [],
      updatedItemIds: [],
    });

    const result = await autoResolveEncounterRoom(playerId, siteId, 'Tester');

    expect(serviceMocks.storePendingLoot).toHaveBeenCalledWith(playerId, overflow);
    expect(result.pendingLootSessionId).toBe('pending-session-1');
  });
});

describe('resolveManualEncounterRound', () => {
  it('tracks quest progress for the mob killed when clearing a manual room', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const mobId = makeEncounterMobId(1);
    const actionDefinitions = { ...BASE_ACTION_DEFINITIONS };
    const template = [{ actionId: 'defend', sortOrder: 0 }];
    const roomMobSlots = [makeEncounterSlot(1, { prefix: 'savage' })];
    const state = makeManualEncounterState({
      playerId,
      siteId,
      roomMobSlots,
      participant: makeParticipant({
        playerId,
        template,
        actionDefinitions,
        hp: 100,
        maxHp: 100,
        stats: makeStats({ damageMin: 0, damageMax: 0, accuracy: 1000 }),
      }),
      mobs: [
        makeMob({
          id: mobId,
          prefix: 'savage',
          hp: 10,
          maxHp: 10,
          stats: makeStats({ damageMin: 0, damageMax: 0, dodge: 0, defence: 0, magicDefence: 0 }),
          actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
          activeEffects: [{
            name: 'Arcane Burn',
            stat: 'attack',
            modifier: 0,
            roundsRemaining: 1,
            damagePerRound: 10,
            dotDamageType: 'magic',
            sourceScalingStat: 'magic',
          }],
        }),
      ],
    });
    const siteMobs = roomMobSlots;
    const killCountProgress = [{ questId: 'weekly-kills', questName: 'Weekly Bounty', current: 1, target: 75, completed: false }];
    const prefixProgress = [{ questId: 'prefix-kills', questName: 'Hunt the savage', current: 1, target: 2, completed: false }];

    progressMocks.trackProgress
      .mockResolvedValueOnce(killCountProgress)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(prefixProgress);
    redisMock.get.mockResolvedValue(JSON.stringify(state));
    combatOrchestrationMocks.fetchFreshTemplateData.mockResolvedValue({
      playerTemplate: template,
      actionDefinitions,
    });
    databaseMocks.tx.encounterSite.findFirst.mockResolvedValue({
      id: siteId,
      playerId,
      mobFamilyId: 'family-1',
      size: 'small',
      discoveredAt: new Date(),
      mobs: siteMobs,
      currentRoom: 1,
      totalRooms: 1,
      roomStrategy: [],
    });

    const result = await resolveManualEncounterRound(playerId, siteId, {});

    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_count', 1, undefined);
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_family', 1, undefined);
    expect(progressMocks.trackProgress).toHaveBeenCalledWith(playerId, 'kill_prefix', 1, { prefix: 'savage' });
    expect((result as { questProgress?: unknown }).questProgress).toEqual([
      ...killCountProgress,
      ...prefixProgress,
    ]);
  });

  it('does not track quest progress for a stale manual room finalization with no newly defeated DB mobs', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const mobId = makeEncounterMobId(1);
    const actionDefinitions = { ...BASE_ACTION_DEFINITIONS };
    const template = [{ actionId: 'defend', sortOrder: 0 }];
    const roomMobSlots = [makeEncounterSlot(1, { prefix: 'savage' })];
    const state = makeManualEncounterState({
      playerId,
      siteId,
      roomMobSlots,
      totalRooms: 2,
      participant: makeParticipant({
        playerId,
        template,
        actionDefinitions,
        hp: 100,
        maxHp: 100,
        stats: makeStats({ damageMin: 0, damageMax: 0, accuracy: 1000 }),
      }),
      mobs: [
        makeMob({
          id: mobId,
          prefix: 'savage',
          hp: 10,
          maxHp: 10,
          stats: makeStats({ damageMin: 0, damageMax: 0, dodge: 0, defence: 0, magicDefence: 0 }),
          actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
          activeEffects: [{
            name: 'Arcane Burn',
            stat: 'attack',
            modifier: 0,
            roundsRemaining: 1,
            damagePerRound: 10,
            dotDamageType: 'magic',
            sourceScalingStat: 'magic',
          }],
        }),
      ],
    });
    const siteMobs = [
      makeEncounterSlot(1, { prefix: 'savage', status: 'defeated' }),
      makeEncounterSlot(2, { room: 2 }),
    ];

    redisMock.get.mockResolvedValue(JSON.stringify(state));
    combatOrchestrationMocks.fetchFreshTemplateData.mockResolvedValue({
      playerTemplate: template,
      actionDefinitions,
    });
    databaseMocks.tx.encounterSite.findFirst.mockResolvedValue({
      id: siteId,
      playerId,
      mobFamilyId: 'family-1',
      size: 'small',
      discoveredAt: new Date(),
      mobs: siteMobs,
      currentRoom: 2,
      totalRooms: 2,
      roomStrategy: [{ room: 1, mode: 'manual', bonusEligible: false }],
    });

    const result = await resolveManualEncounterRound(playerId, siteId, {});

    expect(progressMocks.trackProgress).not.toHaveBeenCalled();
    expect(result.questProgress).toEqual([]);
  });

  it('does not track quest progress while a manual room is still ongoing', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const template = [{ actionId: 'defend', sortOrder: 0 }];
    const actionDefinitions = { ...BASE_ACTION_DEFINITIONS };
    const state = makeManualEncounterState({
      playerId,
      siteId,
      participant: makeParticipant({
        playerId,
        template,
        actionDefinitions,
        hp: 100,
        maxHp: 100,
        stats: makeStats({ damageMin: 0, damageMax: 0, accuracy: 1000 }),
      }),
    });

    redisMock.get.mockResolvedValue(JSON.stringify(state));
    combatOrchestrationMocks.fetchFreshTemplateData.mockResolvedValue({
      playerTemplate: template,
      actionDefinitions,
    });

    const result = await resolveManualEncounterRound(playerId, siteId, {});

    expect(result.outcome).toBe('ongoing');
    expect(progressMocks.trackProgress).not.toHaveBeenCalled();
    expect(result.questProgress).toEqual([]);
    expect(databaseMocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores manual site chest overflow as pending loot', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const mobId = makeEncounterMobId(1);
    const actionDefinitions = { ...BASE_ACTION_DEFINITIONS };
    const template = [{ actionId: 'defend', sortOrder: 0 }];
    const roomMobSlots = [makeEncounterSlot(1)];
    const overflow = [{
      templateId: 'goblin-crown',
      templateName: "Goblin King's Crown",
      rarity: 'common',
      quantity: 1,
      bonusStats: null,
      currentDurability: 120,
      maxDurability: 120,
    }];
    const state = makeManualEncounterState({
      playerId,
      siteId,
      roomMobSlots,
      participant: makeParticipant({
        playerId,
        template,
        actionDefinitions,
        hp: 100,
        maxHp: 100,
        stats: makeStats({ damageMin: 0, damageMax: 0, accuracy: 1000 }),
      }),
      mobs: [
        makeMob({
          id: mobId,
          hp: 10,
          maxHp: 10,
          stats: makeStats({ damageMin: 0, damageMax: 0, dodge: 0, defence: 0, magicDefence: 0 }),
          actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
          activeEffects: [{
            name: 'Arcane Burn',
            stat: 'attack',
            modifier: 0,
            roundsRemaining: 1,
            damagePerRound: 10,
            dotDamageType: 'magic',
            sourceScalingStat: 'magic',
          }],
        }),
      ],
    });
    redisMock.get.mockResolvedValue(JSON.stringify(state));
    combatOrchestrationMocks.fetchFreshTemplateData.mockResolvedValue({
      playerTemplate: template,
      actionDefinitions,
    });
    databaseMocks.tx.encounterSite.findFirst.mockResolvedValue({
      id: siteId,
      playerId,
      mobFamilyId: 'family-1',
      size: 'small',
      discoveredAt: new Date(),
      mobs: roomMobSlots,
      currentRoom: 1,
      totalRooms: 1,
      roomStrategy: [],
    });
    serviceMocks.grantEncounterSiteChestRewardsTx.mockResolvedValueOnce({
      chestRarity: 'common',
      materialRolls: 0,
      loot: [],
      recipeUnlocked: null,
      overflow,
      slotsConsumed: 0,
      newItemIds: [],
      updatedItemIds: [],
    });

    const result = await resolveManualEncounterRound(playerId, siteId, {});

    expect(serviceMocks.storePendingLoot).toHaveBeenCalledWith(playerId, overflow);
    expect(result.pendingLootSessionId).toBe('pending-session-1');
  });

  it('includes current-round player effect tick damage when granting room XP', async () => {
    const playerId = 'test-player';
    const siteId = 'site-1';
    const mobId = makeEncounterMobId(1);
    const actionDefinitions = { ...BASE_ACTION_DEFINITIONS };
    const template = [{ actionId: 'defend', sortOrder: 0 }];
    const roomMobSlots: EncounterMobSlot[] = [
      { slot: 1, mobTemplateId: 'goblin', role: 'trash', prefix: null, status: 'alive', room: 1 },
    ];
    const participant = makeParticipant({
      playerId,
      template,
      actionDefinitions,
      hp: 100,
      maxHp: 100,
      stats: makeStats({ damageMin: 0, damageMax: 0, accuracy: 1000 }),
    });
    const state = {
      playerId,
      siteId,
      currentRoom: 1,
      participant,
      mobs: [
        makeMob({
          id: mobId,
          hp: 10,
          maxHp: 10,
          stats: makeStats({ damageMin: 0, damageMax: 0, dodge: 0, defence: 0, magicDefence: 0 }),
          actionTemplate: [{ actionId: 'boss_rest', targetMode: 'single_target' }],
          activeEffects: [{
            name: 'Arcane Burn',
            stat: 'attack',
            modifier: 0,
            roundsRemaining: 1,
            damagePerRound: 10,
            dotDamageType: 'magic',
            sourceScalingStat: 'magic',
          }],
        }),
      ],
      threatTable: initThreatTable([playerId]),
      roundNumber: 0,
      roundLogs: [],
      allPotionsConsumed: [],
      maxHp: 100,
      turnCostCharged: 1,
      totalRooms: 2,
      mobFamilyId: 'family-1',
      createdAt: Date.now(),
      siteName: 'Test Site',
      zoneId: 'zone-1',
      zoneName: 'Test Zone',
      mobFamilyName: 'Goblins',
      initialMobs: [{ mobId, slot: 1, name: 'Goblin', prefix: null, role: 'trash', hp: 10, maxHp: 10 }],
      mobXpByEncounterMobId: { [mobId]: 20 },
      roomMobSlots,
      attackSkill: 'melee',
      guildXpBoost: 0,
      ...createEncounterSiteXpContributions(),
    };
    const siteMobs = [
      { slot: 1, mobTemplateId: 'goblin', role: 'trash', prefix: null, status: 'alive', room: 1 },
      { slot: 2, mobTemplateId: 'goblin', role: 'trash', prefix: null, status: 'alive', room: 2 },
    ];

    redisMock.get.mockResolvedValue(JSON.stringify(state));
    combatOrchestrationMocks.fetchFreshTemplateData.mockResolvedValue({
      playerTemplate: template,
      actionDefinitions,
    });
    databaseMocks.tx.encounterSite.findFirst.mockResolvedValue({
      id: siteId,
      playerId,
      mobFamilyId: 'family-1',
      size: 'small',
      discoveredAt: new Date(),
      mobs: siteMobs,
      currentRoom: 1,
      totalRooms: 2,
      roomStrategy: [],
    });
    combatOrchestrationMocks.splitAndGrantXp.mockResolvedValue([
      { skillType: 'magic', rawXp: 20, xpAfterEfficiency: 20, leveledUp: false, newLevel: 1 },
    ]);

    await resolveManualEncounterRound(playerId, siteId, {});

    expect(routeHelperMocks.serializeEncounterSiteMobs).toHaveBeenCalledWith([
      { slot: 1, mobTemplateId: 'goblin', role: 'trash', prefix: null, status: 'defeated', room: 1 },
      { slot: 2, mobTemplateId: 'goblin', role: 'trash', prefix: null, status: 'alive', room: 2 },
    ]);
    expect(databaseMocks.tx.encounterSite.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ currentRoom: 2 }),
    }));
    expect(combatOrchestrationMocks.splitAndGrantXp).toHaveBeenCalledWith(
      playerId,
      20,
      'melee',
      { melee: 0, ranged: 0, magic: 10 },
      { melee: 0, ranged: 0, magic: 0 },
      0,
    );
  });
});
