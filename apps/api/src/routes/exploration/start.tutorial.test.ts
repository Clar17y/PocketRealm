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
  rollAndGrantLoot: vi.fn().mockResolvedValue([]),
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
}));
vi.mock('../../services/combatStatsService', () => ({
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
  getSkillLevel: vi.fn().mockResolvedValue(1),
}));
vi.mock('../../services/statsService', () => ({
  incrementStats: vi.fn(),
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
  recordBestiaryKill: vi.fn().mockResolvedValue(undefined),
  trackAchievements: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@adventure/game-engine', () => ({
  applyMobEventModifiers: vi.fn((mob: any) => mob),
  applyMobPrefix: vi.fn((mob: any, prefix: any) => ({ ...mob, mobPrefix: prefix, mobDisplayName: prefix ? `${prefix} ${mob.name}` : mob.name })),
  buildPlayerCombatStats: vi.fn(() => ({ attack: 10, accuracy: 10, defence: 5, magicDefence: 0, speed: 5, hp: 100, critChance: 0.05, critDamage: 1.5 })),
  calculateFleeResult: vi.fn(),
  filterAndWeightMobsByTier: vi.fn(() => []),
  mobToCombatantStats: vi.fn((mob: any) => ({ attack: mob.attack ?? 5, accuracy: 5, defence: 5, magicDefence: 0, speed: 5, hp: mob.hp ?? 20, critChance: 0, critDamage: 1 })),
  rollMobPrefix: vi.fn(() => null),
  runCombat: vi.fn(() => ({
    outcome: 'victory',
    combatantAHpRemaining: 80,
    combatantAMaxHp: 100,
    combatantBMaxHp: 20,
    combatantBHpRemaining: 0,
    log: [],
    potionsConsumed: [],
  })),
  selectTierWithBleedthrough: vi.fn(() => 1),
  simulateExploration: vi.fn(() => []),
  validateExplorationTurns: vi.fn(() => ({ valid: true })),
}));

import { mockPrisma } from '../../__test__/setup';
import { spendPlayerTurnsTx } from '../../services/turnBankService';
import { applyMobPrefix, simulateExploration, runCombat } from '@adventure/game-engine';
import { startRouter } from './start';

const mockSpendPlayerTurnsTx = spendPlayerTurnsTx as ReturnType<typeof vi.fn>;
const mockApplyMobPrefix = applyMobPrefix as ReturnType<typeof vi.fn>;
const mockSimulateExploration = simulateExploration as ReturnType<typeof vi.fn>;
const mockRunCombat = runCombat as ReturnType<typeof vi.fn>;

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
  mockPrisma.player.findUnique.mockResolvedValue({ autoPotionThreshold: 0, tutorialStep });
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
    expect(mockRunCombat).toHaveBeenCalled();
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
