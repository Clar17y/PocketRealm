import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));
vi.mock('@pocketrealm/game-engine', () => ({
  applyMobPrefix: vi.fn((mob: Record<string, unknown>) => ({
    ...mob,
    mobPrefix: null,
    mobDisplayName: mob.name,
  })),
  buildPlayerCombatStats: vi.fn(() => ({ damageMin: 1, damageMax: 3, defence: 1 })),
  filterAndWeightMobsByTier: vi.fn((mobs: unknown[]) => mobs),
  mobToTemplateCombatant: vi.fn(() => ({ id: 'mob-1' })),
  pickWeighted: vi.fn(),
  rollMobPrefix: vi.fn(() => null),
  runTemplateCombat: vi.fn(() => ({
    outcome: 'victory',
    combatantAHpRemaining: 97,
    combatantAMaxHp: 100,
    combatantBMaxHp: 12,
    combatantBHpRemaining: 0,
    combatantAStaminaRemaining: 91,
    combatantAManaRemaining: 42,
    log: [],
    potionsConsumed: [],
    damageByScalingStat: { melee: 10, ranged: 0, magic: 0 },
    resourceCostByScalingStat: { melee: 3, ranged: 0, magic: 0 },
  })),
  simulateTravelAmbushes: vi.fn(() => [{ turnOccurred: 1 }, { turnOccurred: 2 }]),
}));
vi.mock('../utils/pickWeighted.js', () => ({
  pickWeighted: vi.fn((items: unknown[]) => items[0]),
}));
vi.mock('./activityLogService', () => ({
  createActivityLog: vi.fn().mockResolvedValue({ id: 'log-1' }),
}));
vi.mock('./combatOrchestrationService', () => ({
  applyGuildCombatModifiers: vi.fn(),
  buildCombatLogResult: vi.fn(() => ({ log: true })),
  buildPlayerTemplateCombatant: vi.fn(() => ({ id: 'player-1' })),
  preparePlayerForCombat: vi.fn().mockResolvedValue({
    attackSkill: 'melee',
    attackLevel: 1,
    progression: { attributes: { evasion: 1 } },
    equipmentStats: {},
    perActionScaling: {},
    playerTemplate: [],
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
  }),
  processCombatVictoryRewards: vi.fn().mockResolvedValue({
    loot: [],
    overflow: [],
    newItemIds: [],
    updatedItemIds: [],
    xpGrants: [{ boostedXpAfterEfficiency: 6 }],
    questProgress: [],
  }),
}));
vi.mock('./durabilityService', () => ({
  degradeEquippedDurability: vi.fn().mockResolvedValue([]),
}));
vi.mock('./expeditionLockoutService', () => ({
  checkActivityLockout: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./guildTaxService', () => ({
  spendWithTaxTx: vi.fn().mockResolvedValue({
    turnSpend: { currentTurns: 80, spent: 20 },
    taxResult: { taxAmount: 0, postTaxAmount: 20 },
  }),
  taxInfoFromResult: vi.fn(() => ({ taxAmount: 0, postTaxAmount: 20 })),
}));
vi.mock('./guildUpgradeService', () => ({
  getPlayerGuildModifiers: vi.fn().mockResolvedValue({
    combatDamage: 0,
    defenseBoost: 0,
    xpBoost: 0.15,
    travelCostReduction: 0,
    gatheringYield: 0,
    craftingCrit: 0,
    repairCostReduction: 0,
  }),
}));
vi.mock('./hpService', () => ({
  enterRecoveringState: vi.fn(),
  getHpState: vi.fn().mockResolvedValue({ currentHp: 100, maxHp: 100, isRecovering: false }),
  setHp: vi.fn(),
}));
vi.mock('./inventoryService', () => ({
  assertNotOverEncumbered: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./pendingLootService', () => ({
  storePendingLoot: vi.fn(),
}));
vi.mock('./potionService', () => ({
  deductConsumedPotions: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./progressService', () => ({
  trackProgress: vi.fn().mockResolvedValue([]),
}));
vi.mock('./resourceService', () => ({
  setAllResources: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn().mockResolvedValue({}),
  mergeLootIntoStateUpdates: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./staticDataCacheService', () => ({
  getCachedMobTemplatesByZone: vi.fn().mockResolvedValue([
    {
      id: 'mob-1',
      name: 'Forest Rat',
      zoneId: 'zone-a',
      level: 1,
      hp: 12,
      xpReward: 6,
      encounterWeight: 100,
      explorationTier: 1,
      dropChanceMultiplier: 1,
      spellPattern: [],
    },
  ]),
  getCachedZoneConnections: vi.fn(),
  getCachedZones: vi.fn(),
}));
vi.mock('./worldEventService', () => ({
  filterEventModifiers: vi.fn(() => []),
  getActiveEventsForZone: vi.fn().mockResolvedValue([]),
  getActiveWorldWideEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock('./zoneDiscoveryService', () => ({
  discoverZonesFromTown: vi.fn().mockResolvedValue([]),
  ensureStarterDiscoveries: vi.fn(),
  getDiscoveredZoneIds: vi.fn(),
  respawnToHomeTown: vi.fn(),
}));
vi.mock('./zoneExplorationService', () => ({
  calculateExplorationPercent: vi.fn(),
  getExplorationPercent: vi.fn().mockResolvedValue({ percent: 100 }),
}));
vi.mock('./zoneService', () => ({
  invalidateZoneIdCache: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/routeHelpers.js', () => ({
  buildPveCombatOptions: vi.fn(() => ({ combatMode: 'pve_open_world' })),
  calculateFleeWithGold: vi.fn(),
  serializeXpGrant: vi.fn((grant: unknown) => grant),
  toMobTemplate: vi.fn((raw: Record<string, unknown>) => ({
    ...raw,
    spellPattern: [],
    dropChanceMultiplier: raw.dropChanceMultiplier ?? 1,
  })),
  trackAchievements: vi.fn().mockResolvedValue(undefined),
}));

import { mockPrisma } from '../__test__/setup';
import { createActivityLog } from './activityLogService';
import { processCombatVictoryRewards } from './combatOrchestrationService';
import { setHp } from './hpService';
import { travelToZone } from './zoneRoutesService';

describe('travelToZone performance-sensitive ambush persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player.findUniqueOrThrow.mockResolvedValue({
      currentZoneId: 'zone-a',
      lastTravelledFromZoneId: null,
      homeTownId: 'town-1',
    });
    mockPrisma.playerZoneDiscovery.findUnique.mockResolvedValue({ playerId: 'p1', zoneId: 'zone-b' });
    mockPrisma.zoneConnection.findUnique.mockResolvedValue({ fromId: 'zone-a', toId: 'zone-b' });
    mockPrisma.zone.findUniqueOrThrow
      .mockResolvedValueOnce({
        id: 'zone-a',
        name: 'Forest Edge',
        zoneType: 'wild',
        travelCost: 20,
        explorationTiers: null,
      })
      .mockResolvedValueOnce({
        id: 'zone-b',
        name: 'Deep Forest',
        zoneType: 'wild',
        travelCost: 20,
        explorationTiers: null,
      });
    mockPrisma.mobFamilyMember.findMany.mockResolvedValue([
      { mobTemplateId: 'mob-1', mobFamilyId: 'family-rat' },
    ]);
    mockPrisma.turnBank.findUnique.mockResolvedValue({
      currentTurns: 80,
      lastRegenAt: new Date('2026-05-28T00:00:00.000Z'),
    });
    mockPrisma.player.update.mockResolvedValue({});
    mockPrisma.activityLog.createMany.mockResolvedValue({ count: 2 });
  });

  it('batches travel ambush combat logs and leaves victory HP persistence to final resources write', async () => {
    await travelToZone({
      body: { zoneId: '00000000-0000-0000-0000-000000000002' },
      player: { playerId: 'p1', username: 'Traveler' } as never,
    });

    expect(setHp).not.toHaveBeenCalled();
    expect(createActivityLog).not.toHaveBeenCalled();
    expect(mockPrisma.activityLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ playerId: 'p1', activityType: 'combat', turnsSpent: 0 }),
        expect.objectContaining({ playerId: 'p1', activityType: 'combat', turnsSpent: 0 }),
      ],
    });
    expect(processCombatVictoryRewards).toHaveBeenCalledWith(
      expect.objectContaining({ guildXpBoost: 0.15 }),
    );
  });
});
