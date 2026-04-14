import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/turnBankService', () => ({
  spendPlayerTurnsTx: vi.fn().mockResolvedValue({ currentTurns: 86300, timeToCapMs: null, lastRegenAt: new Date().toISOString() }),
  refundPlayerTurns: vi.fn().mockResolvedValue({ currentTurns: 86400, timeToCapMs: null, lastRegenAt: new Date().toISOString() }),
}));
vi.mock('../../services/guildTaxService', () => ({
  applyGuildTaxTx: vi.fn().mockImplementation((_tx: unknown, _pid: string, amount: number) =>
    Promise.resolve({ preTaxAmount: amount, taxAmount: 0, postTaxAmount: amount, taxRatePercent: 0, guildId: null }),
  ),
  taxInfoFromResult: vi.fn().mockReturnValue(null),
}));
vi.mock('../../services/progressService', () => ({
  trackProgress: vi.fn().mockResolvedValue([]),
}));
vi.mock('../../services/hpService', () => ({
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  setHp: vi.fn(),
  enterRecoveringState: vi.fn(),
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
vi.mock('../../services/stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn().mockResolvedValue({}),
  mergeLootIntoStateUpdates: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/potionService', () => ({
  deductConsumedPotions: vi.fn(),
}));
vi.mock('../../services/combatStatsService', () => ({
  getMainHandAttackSkill: vi.fn().mockResolvedValue('melee'),
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
  setAllResources: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/combatLogMapper', () => ({
  mapTemplateCombatLog: vi.fn((log: unknown) => log),
}));
vi.mock('../../services/staticDataCacheService', () => ({
  getCachedMobTemplatesByZone: vi.fn().mockResolvedValue([]),
  getCachedResourceNodesByZone: vi.fn().mockResolvedValue([]),
  getCachedZoneMobFamilies: vi.fn().mockResolvedValue([]),
}));
vi.mock('./helpers', async () => {
  const actual = await vi.importActual<typeof import('./helpers')>('./helpers');
  return {
    ...actual,
    pickWeighted: vi.fn((items: unknown[], weightKey: string) => {
      if (items.length === 0) return null;
      let best = items[0] as Record<string, unknown>;
      let bestWeight = Number(best[weightKey] ?? 0);
      for (const item of items.slice(1)) {
        const candidate = item as Record<string, unknown>;
        const weight = Number(candidate[weightKey] ?? 0);
        if (weight > bestWeight) {
          best = candidate;
          bestWeight = weight;
        }
      }
      return best;
    }),
    buildTrackableMobFamiliesByZone: vi.fn(),
  };
});
vi.mock('../../services/statsService', () => ({
  incrementStats: vi.fn(),
}));
vi.mock('../../services/cacheLootService', () => ({
  grantCacheLootTx: vi.fn().mockResolvedValue({ materials: [], soulboundItem: null, slotsConsumed: 0, overflow: [] }),
}));
vi.mock('../../services/inventoryService', () => ({
  assertNotOverEncumbered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../services/pendingLootService', () => ({
  storePendingLoot: vi.fn().mockResolvedValue('mock-session-id'),
}));
vi.mock('../../utils/routeHelpers.js', () => ({
  serializeXpGrant: vi.fn((grant: any) => grant),
  toMobTemplate: vi.fn((raw: any) => ({
    ...raw,
    spellPattern: Array.isArray(raw.spellPattern) ? raw.spellPattern : [],
  })),
  assertCanAct: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  assertInZone: vi.fn().mockResolvedValue(undefined),
  trackAchievements: vi.fn().mockResolvedValue(undefined),
  buildPveCombatOptions: vi.fn(() => ({ combatMode: 'pve_open_world' })),
}));
vi.mock('../../services/combatOrchestrationService', () => ({
  preparePlayerForCombat: vi.fn().mockResolvedValue({
    attackSkill: 'melee',
    attackLevel: 1,
    progression: { characterXp: 0, characterLevel: 1, attributePoints: 0, attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 } },
    equipmentStats: { attack: 5, accuracy: 5, defence: 5, magicDefence: 0, speed: 0, critChance: 0, critDamage: 1 },
    guildMods: { combatDamage: 0, defenseBoost: 0, xpBoost: 0, travelCostReduction: 0 },
    perActionScaling: { skillLevels: { melee: 1, ranged: 1, magic: 1 }, attributes: { strength: 0, dexterity: 0, intelligence: 0 }, weaponPower: { attack: 5, rangedPower: 0, magicPower: 0 }, equipmentAccuracy: 0, weaponRequiredSkill: 'melee' },
    playerTemplate: [{ id: 'slot-0', sortOrder: 0, actionId: 'light_attack' }],
    potionPool: [],
    resources: { stamina: 100, maxStamina: 100, staminaRegenPerRound: 5, mana: 50, maxMana: 50, manaRegenPerRound: 3 },
    unlockedActions: [],
  }),
  buildPlayerTemplateCombatant: vi.fn(),
  processCombatVictoryRewards: vi.fn(),
  buildCombatLogResult: vi.fn(),
}));
vi.mock('../../services/buffService', () => ({
  getCombatBuffsWithUses: vi.fn().mockResolvedValue({ buffs: { damageBoost: 0, defenceBoost: 0, durabilityShield: 0 }, uses: { damage: 0, defence: 0, durability: 0 } }),
}));
vi.mock('@pocketrealm/game-engine', () => ({
  getScaledZoneExitChance: vi.fn(() => 0.01),
  simulateExploration: vi.fn(() => []),
  validateExplorationTurns: vi.fn(() => ({ valid: true })),
  generateRoomAssignments: vi.fn((size: 'small' | 'medium' | 'large') => ({
    rooms: size === 'small'
      ? [{ roomNumber: 1, mobCount: 1 }]
      : size === 'medium'
        ? [{ roomNumber: 1, mobCount: 2 }]
        : [{ roomNumber: 1, mobCount: 3 }],
    totalMobs: size === 'small' ? 1 : size === 'medium' ? 2 : 3,
  })),
  rollMobPrefix: vi.fn(() => null),
  selectTierWithBleedthrough: vi.fn((tier: number) => tier),
}));
vi.mock('../../services/explorationOutcomeService', () => ({
  processExplorationOutcomes: vi.fn().mockResolvedValue({
    events: [],
    pendingResources: [],
    pendingSites: [],
    pendingCombatLogs: [],
    pendingCacheLoot: [],
    hiddenCaches: [],
    allPotionsConsumed: [],
    ambushPendingLootSessionIds: [],
    allNewItemIds: [],
    allUpdatedItemIds: [],
    allQuestProgress: [],
    currentHp: 100,
    currentStamina: 100,
    currentMana: 50,
    aborted: false,
    abortedAtTurn: null,
    wasKnockedOut: false,
    respawnedTo: null,
    zoneExitDiscovered: false,
  }),
}));
vi.mock('../../services/explorationPersistenceService', () => ({
  persistExplorationResults: vi.fn().mockResolvedValue({
    logId: 'log-1',
    combatLogIds: [],
    encounterSites: [],
    resourceDiscoveries: [],
    cachePendingLootSessionId: null,
  }),
}));

vi.mock('../../middleware/auth', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/errorHandler', () => ({
  AppError: class AppError extends Error {
    statusCode: number;
    code: string;
    constructor(statusCode: number, message: string, code: string) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  },
}));
vi.mock('@pocketrealm/database', () => import('../../__mocks__/database.js'));

import { mockPrisma } from '../../__test__/setup';
import { startRouter } from './start';
import {
  EXPLORATION_TRACKING_CONSTANTS,
  applyTrackedFamilyWeightBias,
  buildTrackableMobFamiliesByZone,
} from './helpers';
import { processExplorationOutcomes } from '../../services/explorationOutcomeService';
import { simulateExploration } from '@pocketrealm/game-engine';
import { TUTORIAL_STEP_EXPLORE } from '@pocketrealm/shared';

const mockBuildTrackableMobFamiliesByZone = buildTrackableMobFamiliesByZone as ReturnType<typeof vi.fn>;
const mockProcessExplorationOutcomes = processExplorationOutcomes as ReturnType<typeof vi.fn>;
const mockSimulateExploration = simulateExploration as ReturnType<typeof vi.fn>;

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

describe('POST /exploration/start tracking contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBuildTrackableMobFamiliesByZone.mockResolvedValue(new Map());
    mockProcessExplorationOutcomes.mockResolvedValue({
      events: [],
      pendingResources: [],
      pendingSites: [],
      pendingCombatLogs: [],
      pendingCacheLoot: [],
      hiddenCaches: [],
      allPotionsConsumed: [],
      ambushPendingLootSessionIds: [],
      allNewItemIds: [],
      allUpdatedItemIds: [],
      allQuestProgress: [],
      currentHp: 100,
      currentStamina: 100,
      currentMana: 50,
      aborted: false,
      abortedAtTurn: null,
      wasKnockedOut: false,
      respawnedTo: null,
      zoneExitDiscovered: false,
    });
    mockPrisma.zone.findUnique.mockResolvedValue({
      id: ZONE_ID,
      name: 'Test Zone',
      difficulty: 1,
      zoneType: 'wild',
      zoneExitChance: 0.01,
      explorationTiers: null,
    });
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 0 });
    mockPrisma.zoneConnection.findMany.mockResolvedValue([]);
    mockPrisma.playerBestiary.upsert.mockResolvedValue({});
    mockPrisma.activityLog.create.mockResolvedValue({ id: 'log-1' });
  });

  it('rejects undiscovered or untrackable family ids', async () => {
    const req = {
      player: { playerId: 'p1', username: 'TestPlayer' },
      body: {
        zoneId: ZONE_ID,
        turns: 500,
        trackingFamilyId: '11111111-1111-1111-1111-111111111111',
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/start');
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'INVALID_TRACKING_FAMILY',
      }),
    );
  });

  it('passes tracking context through to outcome processing and applies the penalty', async () => {
    const trackingFamilyId = '22222222-2222-2222-2222-222222222222';
    mockBuildTrackableMobFamiliesByZone.mockResolvedValue(new Map([
      [ZONE_ID, [{ mobFamilyId: trackingFamilyId, name: 'Spiders' }]],
    ]));

    const req = {
      player: { playerId: 'p1', username: 'TestPlayer' },
      body: {
        zoneId: ZONE_ID,
        turns: 500,
        trackingFamilyId,
      },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/start');
    await handler(req, res, next);

    expect(mockSimulateExploration).toHaveBeenCalledWith(500, null, EXPLORATION_TRACKING_CONSTANTS.RESULT_RATE_MULTIPLIER);
    expect(mockProcessExplorationOutcomes).toHaveBeenCalledWith(
      expect.objectContaining({ trackingFamilyId }),
      expect.any(Array),
    );
  });

  it('ignores tracking entirely during tutorial exploration', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: TUTORIAL_STEP_EXPLORE });

    const req = {
      player: { playerId: 'p1', username: 'TestPlayer' },
      body: {
        zoneId: ZONE_ID,
        turns: 500,
        trackingFamilyId: '11111111-1111-1111-1111-111111111111',
      },
    } as any;
    const res = mockRes();
    const handler = findHandler('post', '/start');
    await handler(req, res, vi.fn());

    expect(mockBuildTrackableMobFamiliesByZone).not.toHaveBeenCalled();
    expect(mockSimulateExploration).not.toHaveBeenCalled();
  });

  it('boosts tracked family weights while suppressing non-tracked ones', () => {
    const result = applyTrackedFamilyWeightBias(
      [
        { mobFamilyId: 'family-spider', discoveryWeight: 100 },
        { mobFamilyId: 'family-rat', discoveryWeight: 100 },
      ],
      'family-spider',
      'discoveryWeight',
    );

    expect(result).toEqual([
      { mobFamilyId: 'family-spider', discoveryWeight: 400 },
      { mobFamilyId: 'family-rat', discoveryWeight: 35 },
    ]);
  });

  it('does not bias encounter-site selection toward a tracked family with no eligible members', async () => {
    const { processExplorationOutcomes: realProcessExplorationOutcomes } =
      await vi.importActual<typeof import('../../services/explorationOutcomeService')>(
        '../../services/explorationOutcomeService',
      );

    const result = await realProcessExplorationOutcomes(
      {
        playerId: 'p1',
        username: 'TestPlayer',
        zoneId: ZONE_ID,
        zone: { id: ZONE_ID, name: 'Test Zone', difficulty: 1 },
        hpState: { currentHp: 100, maxHp: 100 },
        combatPrep: {
          attackSkill: 'melee',
          attackLevel: 1,
          guildMods: {
            combatDamage: 0,
            defenseBoost: 0,
            xpBoost: 0,
            travelCostReduction: 0,
            gatheringYield: 0,
            craftingCrit: 0,
            repairCostReduction: 0,
          },
          perActionScaling: {
            skillLevels: { melee: 1, ranged: 1, magic: 1 },
            attributes: { strength: 0, dexterity: 0, intelligence: 0 },
            weaponPower: { attack: 5, rangedPower: 0, magicPower: 0 },
            equipmentAccuracy: 0,
            weaponRequiredSkill: 'melee',
          },
          playerTemplate: [{ id: 'slot-0', sortOrder: 0, actionId: 'light_attack' }],
          potionPool: [],
          resources: { stamina: 100, maxStamina: 100, staminaRegenPerRound: 5, mana: 50, maxMana: 50, manaRegenPerRound: 3 },
          unlockedActions: [],
        },
        combatBuffs: { damageBoost: 0, defenceBoost: 0, durabilityShield: 0 },
        buffUsesLeft: { damage: 0, defence: 0, durability: 0 },
        progression: {
          characterXp: 0,
          characterLevel: 1,
          attributePoints: 0,
          attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 },
        },
        equipmentStats: { attack: 5, rangedPower: 0, magicPower: 0, accuracy: 5, armor: 5, magicDefence: 0, health: 0, dodge: 0, luck: 0, critChance: 0, critDamage: 1, inventorySlots: 0 },
        mobTemplates: [],
        zoneFamilies: [
          {
            zoneId: ZONE_ID,
            mobFamilyId: 'family-spider',
            discoveryWeight: 50,
            minSize: 'small',
            maxSize: 'small',
            mobFamily: {
              id: 'family-spider',
              name: 'Spiders',
              siteNounSmall: 'Nest',
              siteNounMedium: 'Nest',
              siteNounLarge: 'Nest',
              members: [
                {
                  role: 'trash',
                  mobTemplate: {
                    id: 'spider-elite',
                    name: 'Elite Spider',
                    zoneId: ZONE_ID,
                    explorationTier: 3,
                  },
                },
              ],
            },
          },
          {
            zoneId: ZONE_ID,
            mobFamilyId: 'family-rat',
            discoveryWeight: 100,
            minSize: 'small',
            maxSize: 'small',
            mobFamily: {
              id: 'family-rat',
              name: 'Rats',
              siteNounSmall: 'Nest',
              siteNounMedium: 'Nest',
              siteNounLarge: 'Nest',
              members: [
                {
                  role: 'trash',
                  mobTemplate: {
                    id: 'rat-basic',
                    name: 'Rat',
                    zoneId: ZONE_ID,
                    explorationTier: 1,
                  },
                },
              ],
            },
          },
        ],
        zoneTiers: null,
        selectedTier: 1,
        explorationProgress: { percent: 0, turnsExplored: 0, turnsToExplore: null },
        zoneModifiers: {
          mobDamageMultiplier: 1,
          mobHpMultiplier: 1,
          mobSpawnRateMultiplier: 1,
          resourceDropRateMultiplier: 1,
          resourceYieldMultiplier: 1,
        },
        spawnMods: { global: 1, byFamily: new Map() },
        mobToFamilyMap: new Map([
          ['spider-elite', 'family-spider'],
          ['rat-basic', 'family-rat'],
        ]),
        trackingFamilyId: 'family-spider',
        cachedZoneEvents: [],
        cachedWorldEvents: [],
        isTutorialExplore: false,
        resourceNodes: [],
        undiscoveredNeighbors: [],
        thresholdByToId: new Map(),
      },
      [{ turnOccurred: 10, type: 'encounter_site' }],
    );

    expect(result.events[0]).toEqual(
      expect.objectContaining({
        type: 'encounter_site',
        details: expect.objectContaining({ mobFamilyId: 'family-rat' }),
      }),
    );
  });
});
