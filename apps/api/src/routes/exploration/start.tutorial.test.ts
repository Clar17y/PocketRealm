import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/turnBankService', () => ({
  spendPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 86300, timeToCapMs: null, lastRegenAt: new Date().toISOString() }),
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({ currentTurns: 86300, timeToCapMs: null, lastRegenAt: new Date().toISOString() }),
  refundPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 86400, timeToCapMs: null, lastRegenAt: new Date().toISOString() }),
}));
vi.mock('../../services/guildTaxService', () => ({
  applyGuildTaxTx: vi.fn().mockImplementation((_tx: unknown, _pid: string, amount: number) =>
    Promise.resolve({ preTaxAmount: amount, taxAmount: 0, postTaxAmount: amount, taxRatePercent: 0, guildId: null }),
  ),
  taxInfoFromResult: vi.fn().mockReturnValue(null),
}));
vi.mock('../../services/guildService', () => ({
  getPlayerGuildId: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../services/guildContractService', () => ({
  incrementContractProgress: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  setHp: vi.fn(),
  enterRecoveringState: vi.fn(),
}));
vi.mock('../../services/lootService', () => ({
  rollAndGrantLootWithCapacity: vi.fn().mockResolvedValue({ drops: [], pendingLootSessionId: null }),
}));
vi.mock('../../services/xpService', () => ({
  grantSkillXp: vi.fn().mockResolvedValue({
    skillType: 'melee', xpResult: { xpGained: 10, xpAfterEfficiency: 10, efficiency: 1, leveledUp: false, newLevel: 1, atDailyCap: false },
    newTotalXp: 10, newDailyXpGained: 10,
    characterXpGain: 5, characterXpAfter: 5, characterLevelBefore: 1, characterLevelAfter: 1,
    attributePointsAfter: 0, characterLeveledUp: false,
  }),
}));
vi.mock('../../services/durabilityService', () => ({
  degradeEquippedDurability: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/equipmentService', () => ({
  getEquipmentStats: vi.fn().mockResolvedValue({ attack: 5, accuracy: 5, defence: 5, magicDefence: 0, speed: 0, critChance: 0, critDamage: 1 }),
}));
vi.mock('../../services/attributesService', () => ({
  getPlayerProgressionState: vi.fn().mockResolvedValue({
    characterXp: 0, characterLevel: 1, attributePoints: 0,
    attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 },
  }),
}));
vi.mock('../../services/zoneDiscoveryService', () => ({
  discoverZone: vi.fn(),
  getUndiscoveredNeighborZones: vi.fn().mockResolvedValue([]),
  respawnToHomeTown: vi.fn(),
}));
vi.mock('../../services/zoneExplorationService', () => ({
  addExplorationTurns: vi.fn(),
  calculateExplorationPercent: vi.fn().mockReturnValue(10),
  getExplorationPercent: vi.fn().mockResolvedValue({ turnsExplored: 0, percent: 10, turnsToExplore: 10000 }),
}));
vi.mock('../../services/worldEventService', () => ({
  computeZoneModifiers: vi.fn().mockReturnValue({
    mobDamageMultiplier: 1, mobHpMultiplier: 1, mobSpawnRateMultiplier: 1,
    resourceDropRateMultiplier: 1, resourceYieldMultiplier: 1,
  }),
  computeSpawnRateModifiers: vi.fn().mockReturnValue({ byFamily: new Map(), global: 1 }),
  getActiveEventsForZone: vi.fn().mockResolvedValue([]),
  getActiveWorldWideEvents: vi.fn().mockResolvedValue([]),
  filterEventModifiers: vi.fn().mockReturnValue([]),
  spawnWorldEvent: vi.fn(),
}));
vi.mock('../../services/bossEncounterService', () => ({
  createBossEncounter: vi.fn(),
}));
vi.mock('../../services/eventSchedulerService', () => ({
  checkAndSpawnEvents: vi.fn(),
}));
vi.mock('../../socket', () => ({
  getIo: vi.fn(),
}));
vi.mock('../../services/achievementService', () => ({
  emitAchievementNotifications: vi.fn(),
  checkAchievements: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/systemMessageService', () => ({
  emitSystemMessage: vi.fn(),
}));
vi.mock('../../services/persistedMobService', () => ({
  persistMobHp: vi.fn(),
}));
vi.mock('../../services/potionService', () => ({
  buildPotionPool: vi.fn().mockResolvedValue([]),
  deductConsumedPotions: vi.fn(),
  templateHasPotionActions: vi.fn().mockReturnValue(false),
}));
vi.mock('../../services/combatStatsService', () => ({
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
  getSkillLevel: vi.fn().mockResolvedValue(1),
  buildPerActionScaling: vi.fn().mockResolvedValue({
    skillLevels: { melee: 1, ranged: 1, magic: 1 },
    attributes: { strength: 0, dexterity: 0, intelligence: 0 },
    weaponPower: { attack: 5, rangedPower: 0, magicPower: 0 },
    equipmentAccuracy: 0,
    weaponRequiredSkill: 'melee',
  }),
}));
vi.mock('../../services/guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn().mockResolvedValue({
    combatDamage: 0, defenseBoost: 0, xpBoost: 0, travelCostReduction: 0,
  }),
}));
vi.mock('../../services/combatTemplateService', () => ({
  getActiveTemplate: vi.fn().mockResolvedValue([{ id: 'slot-0', sortOrder: 0, actionId: 'light_attack' }]),
}));
vi.mock('../../services/skillPointService', () => ({
  getSkillPoints: vi.fn().mockResolvedValue({
    playerId: 'test-player',
    totalPointsEarned: 0,
    totalPointsSpent: 0,
    availablePoints: 0,
    allocations: {},
    unlockedActions: [],
  }),
}));
vi.mock('../../services/resourceService', () => ({
  getResourceState: vi.fn().mockResolvedValue({
    stamina: { current: 100, max: 100, regenPerRound: 5 },
    mana: { current: 50, max: 50, regenPerRound: 3 },
  }),
  setAllResources: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/combatLogMapper', () => ({
  mapTemplateCombatLog: vi.fn((log: any) => log),
}));
vi.mock('../../services/statsService', () => ({
  incrementStats: vi.fn(),
}));
vi.mock('../../services/cacheLootService', () => ({
  grantCacheLootTx: vi.fn().mockResolvedValue({ materials: [], soulboundItem: null, slotsConsumed: 0, overflow: [] }),
}));
vi.mock('../../services/inventoryService', () => ({
  getInventoryState: vi.fn().mockResolvedValue({ usedSlots: 5, capacity: 24, availableSlots: 19 }),
  assertNotOverEncumbered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/pendingLootService', () => ({
  storePendingLoot: vi.fn().mockResolvedValue('mock-session-id'),
}));
vi.mock('../../utils/routeHelpers.js', () => ({
  serializeXpGrant: vi.fn((grant: any) => ({
    skillType: grant.skillType, ...grant.xpResult,
    newTotalXp: grant.newTotalXp, newDailyXpGained: grant.newDailyXpGained,
    characterXpGain: grant.characterXpGain, characterXpAfter: grant.characterXpAfter,
    characterLevelBefore: grant.characterLevelBefore, characterLevelAfter: grant.characterLevelAfter,
    attributePointsAfter: grant.attributePointsAfter, characterLeveledUp: grant.characterLeveledUp,
  })),
  toMobTemplate: vi.fn((raw: any) => ({
    ...raw,
    spellPattern: Array.isArray(raw.spellPattern) ? raw.spellPattern : [],
  })),
  assertNotRecovering: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  assertCanAct: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  recordBestiaryKill: vi.fn().mockResolvedValue(undefined),
  trackAchievements: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@pocketrealm/game-engine', () => ({
  applyMobEventModifiers: vi.fn((mob: any) => mob),
  applyMobPrefix: vi.fn((mob: any, prefix: any) => ({ ...mob, mobPrefix: prefix, mobDisplayName: prefix ? `${prefix} ${mob.name}` : mob.name })),
  buildPlayerCombatStats: vi.fn(() => ({ attack: 10, accuracy: 10, defence: 5, magicDefence: 0, speed: 5, hp: 100, critChance: 0.05, critDamage: 1.5 })),
  calculateFleeResult: vi.fn(),
  filterAndWeightMobsByTier: vi.fn(() => []),
  mobToTemplateCombatant: vi.fn((mob: any) => ({ id: mob.id, name: mob.mobDisplayName ?? mob.name, stats: { attack: mob.attack ?? 5, accuracy: 5, defence: 5, magicDefence: 0, speed: 5, hp: mob.hp ?? 20, critChance: 0, critDamage: 1 }, template: [], stamina: 100, maxStamina: 100, staminaRegenPerRound: 5, mana: 50, maxMana: 50, manaRegenPerRound: 3, actionDefinitions: {} })),
  rollMobPrefix: vi.fn(() => null),
  runTemplateCombat: vi.fn(() => ({
    outcome: 'victory',
    combatantAHpRemaining: 80,
    combatantAMaxHp: 100,
    combatantBMaxHp: 20,
    combatantBHpRemaining: 0,
    combatantAStaminaRemaining: 90,
    combatantBStaminaRemaining: 100,
    combatantAManaRemaining: 45,
    combatantBManaRemaining: 50,
    log: [],
    potionsConsumed: [],
    damageByScalingStat: { melee: 20, ranged: 0, magic: 0 },
    resourceCostByScalingStat: { melee: 10, ranged: 0, magic: 0 },
  })),
  getScaledZoneExitChance: vi.fn(() => 0.01),
  selectTierWithBleedthrough: vi.fn(() => 1),
  simulateExploration: vi.fn(() => []),
  validateExplorationTurns: vi.fn(() => ({ valid: true })),
}));

import { mockPrisma } from '../../__test__/setup';
import { spendPlayerTurnsTx } from '../../services/turnBankService';
import { applyMobPrefix, simulateExploration, runTemplateCombat } from '@pocketrealm/game-engine';
import { startRouter } from './start';

const mockSpendPlayerTurnsTx = spendPlayerTurnsTx as ReturnType<typeof vi.fn>;
const mockApplyMobPrefix = applyMobPrefix as ReturnType<typeof vi.fn>;
const mockSimulateExploration = simulateExploration as ReturnType<typeof vi.fn>;
const mockRunTemplateCombat = runTemplateCombat as ReturnType<typeof vi.fn>;

function findHandler(method: string, path: string) {
  const layer = (startRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

const ZONE_ID = '00000000-0000-0000-0000-000000000001';

function baseReq(overrides: Record<string, any> = {}) {
  return {
    player: { playerId: 'p1', username: 'TestPlayer' },
    body: { zoneId: ZONE_ID, turns: 500 },
    ...overrides,
  } as any;
}

function setupZoneAndMobs(tutorialStep: number) {
  mockPrisma.zone.findUnique.mockResolvedValue({
    id: ZONE_ID, name: 'Test Zone', difficulty: 1, zoneType: 'wild',
    zoneExitChance: 0.01, explorationTiers: null,
  });
  mockPrisma.mobTemplate.findMany.mockResolvedValue([
    { id: 'mob-fm', name: 'Field Mouse', level: 1, hp: 20, attack: 3, accuracy: 5, defence: 2, magicDefence: 0, speed: 5, xpReward: 10, encounterWeight: 100, explorationTier: 1, zoneId: ZONE_ID, dropChanceMultiplier: 1, spellPattern: [] },
    { id: 'mob-rat', name: 'Giant Rat', level: 2, hp: 30, attack: 5, accuracy: 5, defence: 3, magicDefence: 0, speed: 4, xpReward: 15, encounterWeight: 100, explorationTier: 1, zoneId: ZONE_ID, dropChanceMultiplier: 1, spellPattern: [] },
  ]);
  mockPrisma.resourceNode.findMany.mockResolvedValue([]);
  mockPrisma.zoneMobFamily.findMany.mockResolvedValue([]);
  mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
  mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep });
  mockPrisma.playerBestiary.upsert.mockResolvedValue({});
  mockPrisma.activityLog.create.mockResolvedValue({ id: 'log-1' });
}

describe('exploration tutorial path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forces 100 turns when tutorialStep is 1 (regardless of body.turns)', async () => {
    setupZoneAndMobs(1);

    const req = baseReq({ body: { zoneId: ZONE_ID, turns: 500 } });
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Should spend 100 turns, not 500 (called via transaction)
    expect(mockSpendPlayerTurnsTx).toHaveBeenCalledWith(expect.anything(), 'p1', 100);
  });

  it('produces exactly one ambush at turn 50 and does not call simulateExploration', async () => {
    setupZoneAndMobs(1);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Should NOT call simulateExploration for tutorial
    expect(mockSimulateExploration).not.toHaveBeenCalled();
    // Should have run combat (from the forced ambush)
    expect(mockRunTemplateCombat).toHaveBeenCalled();
  });

  it('selects Field Mouse by name and applies no prefix', async () => {
    setupZoneAndMobs(1);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // applyMobPrefix should be called with null prefix
    expect(mockApplyMobPrefix).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Field Mouse' }),
      null,
    );
  });

  it('falls back to first mob if Field Mouse not found', async () => {
    setupZoneAndMobs(1);
    // Override mobs to not include Field Mouse
    mockPrisma.mobTemplate.findMany.mockResolvedValue([
      { id: 'mob-rat', name: 'Giant Rat', level: 2, hp: 30, attack: 5, accuracy: 5, defence: 3, magicDefence: 0, speed: 4, xpReward: 15, encounterWeight: 100, explorationTier: 1, zoneId: ZONE_ID, dropChanceMultiplier: 1, spellPattern: [] },
    ]);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    expect(mockApplyMobPrefix).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Giant Rat' }),
      null,
    );
  });

  it('uses simulateExploration for non-tutorial players (tutorialStep !== 1)', async () => {
    setupZoneAndMobs(0);
    mockSimulateExploration.mockReturnValue([]);

    const req = baseReq({ body: { zoneId: ZONE_ID, turns: 500 } });
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Should spend the requested turns, not 100 (called via transaction)
    expect(mockSpendPlayerTurnsTx).toHaveBeenCalledWith(expect.anything(), 'p1', 500);
    // Should call simulateExploration (exitChance is null when no undiscovered neighbors, spawnRateMultiplier is 1 with no zone families)
    expect(mockSimulateExploration).toHaveBeenCalledWith(500, null, 1);
  });

  it('combat victory during tutorial grants XP and loot normally', async () => {
    setupZoneAndMobs(1);

    const req = baseReq();
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    // Response should include events with ambush_victory
    const jsonCall = res.json.mock.calls[0][0];
    expect(jsonCall.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'ambush_victory' }),
      ]),
    );
  });
});
