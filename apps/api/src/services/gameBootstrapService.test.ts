import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

const serviceMocks = vi.hoisted(() => ({
  clearStaleEncounterSiteLockout: vi.fn(),
  ensureEquipmentSlots: vi.fn(),
  getActiveBuffs: vi.fn(),
  getActiveEventsForZone: vi.fn(),
  getCachedCraftingRecipes: vi.fn(),
  getExpeditionCooldowns: vi.fn(),
  getHpState: vi.fn(),
  getInventoryState: vi.fn(),
  getPlayerGuild: vi.fn(),
  getResourceState: vi.fn(),
  getSkillPoints: vi.fn(),
  getTurnState: vi.fn(),
  listZones: vi.fn(),
  normalizePlayerAttributes: vi.fn((attributes: unknown) => attributes),
}));

vi.mock('./attributesService', () => ({
  normalizePlayerAttributes: serviceMocks.normalizePlayerAttributes,
}));

vi.mock('./buffService', () => ({
  getActiveBuffs: serviceMocks.getActiveBuffs,
}));

vi.mock('./equipmentService', () => ({
  ensureEquipmentSlots: serviceMocks.ensureEquipmentSlots,
}));

vi.mock('./expeditionLockoutService', () => ({
  clearStaleEncounterSiteLockout: serviceMocks.clearStaleEncounterSiteLockout,
}));

vi.mock('./expeditionService', () => ({
  getExpeditionCooldowns: serviceMocks.getExpeditionCooldowns,
}));

vi.mock('./guildService', () => ({
  getPlayerGuild: serviceMocks.getPlayerGuild,
}));

vi.mock('./hpService', () => ({
  getHpState: serviceMocks.getHpState,
}));

vi.mock('./inventoryService', () => ({
  getInventoryState: serviceMocks.getInventoryState,
}));

vi.mock('./resourceService', () => ({
  getResourceState: serviceMocks.getResourceState,
}));

vi.mock('./skillPointService', () => ({
  getSkillPoints: serviceMocks.getSkillPoints,
}));

vi.mock('./staticDataCacheService', () => ({
  getCachedCraftingRecipes: serviceMocks.getCachedCraftingRecipes,
}));

vi.mock('./turnBankService', () => ({
  getTurnState: serviceMocks.getTurnState,
}));

vi.mock('./worldEventService', () => ({
  getActiveEventsForZone: serviceMocks.getActiveEventsForZone,
}));

vi.mock('./zoneRoutesService', () => ({
  listZones: serviceMocks.listZones,
}));

import { prisma } from '@pocketrealm/database';
import { getGameBootstrap } from './gameBootstrapService';

const PLAYER_ID = 'player-1';
const STARTER_ZONE_ID = '00000000-0000-0000-0000-000000000001';

function mockPlayer() {
  return {
    id: PLAYER_ID,
    username: 'hero',
    accountId: 'account-1',
    seasonId: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    lastActiveAt: new Date('2026-06-24T08:00:00.000Z'),
    characterXp: 100n,
    characterLevel: 3,
    attributePoints: 2,
    attributes: { vitality: 1, strength: 1, dexterity: 1, intelligence: 1, luck: 1, evasion: 1 },
    tutorialStep: 99,
    combatLogSpeedMs: 500,
    explorationSpeedMs: 500,
    autoSkipKnownCombat: false,
    defaultExploreTurns: 10,
    quickRestHealPercent: 50,
    defaultRefiningMax: false,
    lowHpWarning: true,
    confirmRarity: 'rare',
    lootRevealRarity: 'rare',
    forgeConfirmRarity: 'rare',
    showNpcDialogue: true,
    showItemFlavourText: true,
    showBestiaryLore: true,
    activeTitle: null,
    gold: 25,
    homeTownId: null,
    activeEncounterSiteId: null,
    notifyPvpAttack: true,
    notifyPvpScout: true,
    notifyBossAppeared: true,
    notifyBossKilled: true,
    notifyTurnBankFull: true,
    notifyExpeditionStarted: true,
    notifyExpeditionFinished: true,
    account: {
      email: 'hero@example.com',
      role: 'player',
      emailVerified: true,
      isPremium: false,
      premiumExpiresAt: null,
    },
  };
}

describe('getGameBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(prisma.player.findUnique).mockResolvedValue(mockPlayer() as never);
    vi.mocked(prisma.playerSkill.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.playerRecipe.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.item.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.item.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.playerEquipment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.itemTemplate.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.guildMember.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.zone.findUnique).mockResolvedValue({
      name: 'Starter Town',
      maxCraftingLevel: 4,
    } as never);

    serviceMocks.clearStaleEncounterSiteLockout.mockResolvedValue(false);
    serviceMocks.ensureEquipmentSlots.mockResolvedValue(undefined);
    serviceMocks.getActiveBuffs.mockResolvedValue([]);
    serviceMocks.getActiveEventsForZone.mockResolvedValue([{ id: 'event-1', name: 'Festival' }]);
    serviceMocks.getCachedCraftingRecipes.mockResolvedValue([
      {
        id: 'recipe-1',
        skillType: 'smithing',
        requiredLevel: 1,
        resultTemplate: {
          id: 'template-1',
          name: 'Copper Sword',
          itemType: 'weapon',
          slot: 'weapon',
          tier: 1,
          baseStats: {},
          stackable: false,
          maxDurability: 10,
          requiredSkill: null,
          requiredLevel: 1,
        },
        isAdvanced: false,
        mobFamily: null,
        soulbound: false,
        mobFamilyId: null,
        turnCost: 1,
        materials: [],
        xpReward: 1,
      },
    ]);
    serviceMocks.getHpState.mockResolvedValue({
      currentHp: 10,
      maxHp: 10,
      regenPerSecond: 1,
      isRecovering: false,
      recoveryCost: null,
    });
    serviceMocks.getInventoryState.mockResolvedValue({ capacity: 24, usedSlots: 0 });
    serviceMocks.getPlayerGuild.mockResolvedValue(null);
    serviceMocks.getResourceState.mockResolvedValue({
      stamina: { current: 10, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
      mana: { current: 10, max: 10, regenPerRound: 1, regenPerSecond: 1, restHealPerTurn: 1 },
    });
    serviceMocks.getSkillPoints.mockResolvedValue({ availablePoints: 0, spentPoints: 0, allocations: [] });
    serviceMocks.getTurnState.mockResolvedValue({
      currentTurns: 42,
      timeToCapMs: null,
      lastRegenAt: '2026-06-24T08:00:00.000Z',
    });
    serviceMocks.listZones.mockResolvedValue({
      body: {
        zones: [],
        connections: [],
        undiscoveredZones: [],
        currentZoneId: STARTER_ZONE_ID,
      },
    });
  });

  it('uses the zone resolved by bootstrap zones when building crafting metadata', async () => {
    const result = await getGameBootstrap(PLAYER_ID);

    expect(result.zones.currentZoneId).toBe(STARTER_ZONE_ID);
    expect(result.turns.currentTurns).toBe(42);
    expect(result.player.player.characterXp).toBe(100);
    expect(result.inventory).toMatchObject({ items: [], capacity: 24, usedSlots: 0 });
    expect(Object.keys(result.skillPoints.trees).length).toBeGreaterThan(0);
    expect(result.crafting.zoneName).toBe('Starter Town');
    expect(result.crafting.zoneCraftingLevel).toBe(4);
    expect(prisma.player.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.zone.findUnique).toHaveBeenCalledWith({
      where: { id: STARTER_ZONE_ID },
      select: { name: true, maxCraftingLevel: true },
    });
    expect(serviceMocks.getActiveEventsForZone).toHaveBeenCalledWith(STARTER_ZONE_ID);
    expect(result.zoneEvents.events).toEqual([{ id: 'event-1', name: 'Festival' }]);
    expect(result.guild).toBeNull();
  });
});
