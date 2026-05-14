import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameController } from './useGameController';
import { getCraftingRecipes, getZoneEvents, getZones } from '@/lib/api';
import type { InventoryItemDTO } from '@pocketrealm/shared';

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  trackOnce: vi.fn(),
}));

vi.mock('@/lib/assets', () => ({
  itemImageSrc: vi.fn((name: string) => `/items/${name}`),
}));

vi.mock('@/lib/changelog', () => ({
  getLatestVersion: vi.fn(() => '0.0'),
  CHANGELOG_STORAGE_KEY: 'changelog',
}));

vi.mock('@/lib/rarity', () => ({
  RARITY_RANK: { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 },
}));

vi.mock('@/hooks/useCombatLogPrefetch', () => ({
  useCombatLogPrefetch: vi.fn(() => ({ clear: vi.fn() })),
}));

vi.mock('@/hooks/usePageVisible', () => ({
  useVisibleInterval: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  updateTutorialStep: vi.fn(),
  claimStarterWeapon: vi.fn(),
  allocatePlayerAttribute: vi.fn(),
  craft: vi.fn(),
  getCraftingRecipes: vi.fn(),
  getEquipment: vi.fn(),
  getHpState: vi.fn(),
  getInventory: vi.fn(),
  getPlayer: vi.fn(),
  getPlayerGuild: vi.fn(),
  getPvpNotificationCount: vi.fn(),
  getSkills: vi.fn(),
  getTurns: vi.fn(),
  getZones: vi.fn(),
  getZoneEvents: vi.fn(),
  mine: vi.fn(),
  rest: vi.fn(),
  restEstimate: vi.fn(),
  getResources: vi.fn(),
  getSkillPointState: vi.fn(),
  allocateSkillPoint: vi.fn(),
  respecSkillPoints: vi.fn(),
  getTemplates: vi.fn(),
  activateTemplate: vi.fn(),
  exchangeGold: vi.fn(),
  placeRouletteBet: vi.fn(),
  getIncomingFriendRequests: vi.fn(),
  getFriendMailUnreadCount: vi.fn(),
  getPlayerBuffs: vi.fn(),
  getExpeditionCooldowns: vi.fn(),
}));

vi.mock('./applyStateUpdates', () => ({
  applyStateUpdates: vi.fn(),
}));

vi.mock('@/lib/statFormat', () => ({
  prettyStatName: vi.fn(),
  formatStatValue: vi.fn(),
}));

vi.mock('./combatHelpers', () => ({
  buildLastCombat: vi.fn(),
  isMobKnown: vi.fn(() => false),
}));

vi.mock('./hooks/useActivityLog', () => ({
  useActivityLog: vi.fn(() => ({
    activityLog: [],
    setActivityLog: vi.fn(),
    pushLog: vi.fn(),
  })),
  nowStamp: vi.fn(() => 'now'),
}));

vi.mock('../../lib/activityTracker', () => ({
  recordTurnsSpent: vi.fn(),
}));

vi.mock('./hooks/usePlayerSettings', () => ({
  usePlayerSettings: vi.fn(() => ({
    combatLogSpeedMs: 250,
    setCombatLogSpeedMs: vi.fn(),
    explorationSpeedMs: 250,
    setExplorationSpeedMs: vi.fn(),
    autoSkipKnownCombat: false,
    defaultExploreTurns: 100,
    setDefaultExploreTurns: vi.fn(),
    quickRestHealPercent: 50,
    setQuickRestHealPercent: vi.fn(),
    defaultRefiningMax: 10,
    lowHpWarning: true,
    confirmRarity: 'rare',
    lootRevealRarity: 'rare',
    forgeConfirmRarity: 'rare',
    guildTaxRate: 0,
    setGuildTaxRate: vi.fn(),
    showNpcDialogue: true,
    showItemFlavourText: true,
    showBestiaryLore: true,
    handleSetCombatLogSpeed: vi.fn(),
    handleSetExplorationSpeed: vi.fn(),
    handleSetAutoSkipKnownCombat: vi.fn(),
    handleSetDefaultExploreTurns: vi.fn(),
    handleSetQuickRestHealPercent: vi.fn(),
    handleSetDefaultRefiningMax: vi.fn(),
    handleSetLowHpWarning: vi.fn(),
    handleSetConfirmRarity: vi.fn(),
    handleSetLootRevealRarity: vi.fn(),
    handleSetForgeConfirmRarity: vi.fn(),
    initSettingsFromServer: vi.fn(),
    homeTownId: null,
    handleSetHomeTown: vi.fn(),
    handleSetShowNpcDialogue: vi.fn(),
    handleSetShowItemFlavourText: vi.fn(),
    handleSetShowBestiaryLore: vi.fn(),
    notificationPrefs: {},
    handleSetNotificationPref: vi.fn(),
  })),
}));

vi.mock('./hooks/useBestiary', () => ({
  useBestiary: vi.fn(() => ({
    bestiaryMobs: [],
    bestiaryLoading: false,
    bestiaryError: null,
    bestiaryPrefixSummary: null,
    expeditionThemes: [],
    worldBosses: [],
    loadBestiary: vi.fn(),
  })),
}));

vi.mock('./hooks/useGathering', () => ({
  useGathering: vi.fn(() => ({
    gatheringNodes: [],
    gatheringLoading: false,
    gatheringError: null,
    gatheringPage: 1,
    gatheringPagination: { page: 1, pageSize: 8, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
    gatheringFilters: { zones: [], resourceTypes: [] },
    gatheringZoneFilter: 'all',
    gatheringResourceTypeFilter: 'all',
    activeGatheringSkill: 'mining',
    setActiveGatheringSkill: vi.fn(),
    loadGatheringNodes: vi.fn(),
    handleGatheringPageChange: vi.fn(),
    handleGatheringZoneFilterChange: vi.fn(),
    handleGatheringResourceTypeFilterChange: vi.fn(),
  })),
}));

vi.mock('./hooks/useEncounterSites', () => ({
  useEncounterSites: vi.fn(() => ({
    pendingEncounters: [],
    pendingEncountersLoading: false,
    pendingEncountersError: null,
    pendingEncounterPage: 1,
    pendingEncounterPagination: { page: 1, pageSize: 8, total: 0, totalPages: 1, hasNext: false, hasPrevious: false },
    pendingEncounterFilters: { zones: [], mobs: [] },
    pendingEncounterZoneFilter: 'all',
    pendingEncounterMobFilter: 'all',
    pendingEncounterSort: 'danger',
    pendingClockMs: 0,
    refreshPendingEncounters: vi.fn(),
    handlePendingEncounterPageChange: vi.fn(),
    handlePendingEncounterZoneFilterChange: vi.fn(),
    handlePendingEncounterMobFilterChange: vi.fn(),
    handlePendingEncounterSortChange: vi.fn(),
  })),
}));

vi.mock('./hooks/useAchievements', () => ({
  useAchievements: vi.fn(() => ({
    achievementData: null,
    achievementUnclaimedCount: 0,
    activeTitle: null,
    handleClaimAchievement: vi.fn(),
    handleSetActiveTitle: vi.fn(),
    loadAchievements: vi.fn(),
  })),
}));

vi.mock('./hooks/useQuests', () => ({
  useQuests: vi.fn(() => ({
    quests: [],
    questState: null,
    questsLoading: false,
    questsError: null,
    loadQuests: vi.fn(),
    handleClaimQuestReward: vi.fn(),
    handleClaimDailyBonus: vi.fn(),
    handleRerollQuest: vi.fn(),
    updateQuestProgress: vi.fn(),
  })),
}));

vi.mock('./hooks/useCombatPlayback', () => ({
  useCombatPlayback: vi.fn(() => ({
    combatPlaybackQueue: null,
    setCombatPlaybackQueue: vi.fn(),
    combatPlaybackIndex: 0,
    setCombatPlaybackIndex: vi.fn(),
    roomTransition: null,
    setRoomTransition: vi.fn(),
    combatPlaybackData: null,
    pendingCombatRewardsRef: { current: null },
    siteJustClearedRef: { current: false },
    combatPendingLootRef: { current: null },
    handleCombatPlaybackComplete: vi.fn(),
  })),
}));

vi.mock('./simpleAction', () => ({
  runSimpleAction: vi.fn(),
}));

vi.mock('@/hooks/useConnectionStatus', () => ({
  useConnectionStatus: vi.fn(() => 'connected'),
}));

vi.mock('./hooks/useInventoryActions', () => ({
  useInventoryActions: vi.fn(() => ({})),
}));

vi.mock('./hooks/useLootActions', () => ({
  useLootActions: vi.fn(() => ({
    activatePendingLoot: vi.fn(),
    pendingLootSession: null,
    setPendingLootSession: vi.fn(),
    reloadPendingLootSession: vi.fn(),
    activateNextQueuedLoot: vi.fn(),
    handleClaimLoot: vi.fn(),
    handleDismissLoot: vi.fn(),
    handleReopenLoot: vi.fn(),
  })),
}));

vi.mock('./hooks/useExplorationActions', () => ({
  useExplorationActions: vi.fn(() => ({
    explorationPlaybackData: null,
    handleStartExploration: vi.fn(),
    handleExplorationPlaybackComplete: vi.fn(),
    handlePlaybackSkip: vi.fn(),
    logDurabilityWarnings: vi.fn(),
  })),
}));

vi.mock('./hooks/useTravelActions', () => ({
  useTravelActions: vi.fn(() => ({
    handleTravelToZone: vi.fn(),
    confirmAbandonLoot: vi.fn(),
    abandonLootAndTravel: vi.fn(),
    cancelAbandonLoot: vi.fn(),
    travelPlaybackData: null,
    handleTravelPlaybackComplete: vi.fn(),
    handleTravelPlaybackSkip: vi.fn(),
  })),
}));

function makeInventoryItem(
  overrides: Partial<InventoryItemDTO> & {
    template?: Partial<InventoryItemDTO['template']>;
  },
): InventoryItemDTO {
  return {
    id: 'item-1',
    templateId: 'tpl-1',
    ownerId: 'player-1',
    rarity: 'common',
    currentDurability: null,
    maxDurability: null,
    quantity: 1,
    bonusStats: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    equippedSlot: null,
    ...overrides,
    template: {
      id: 'tpl-1',
      name: 'Iron Ore',
      itemType: 'resource',
      weightClass: null,
      slot: null,
      tier: 1,
      baseStats: {},
      requiredSkill: null,
      requiredLevel: 1,
      maxDurability: 0,
      stackable: true,
      sellPrice: 5,
      flavorText: null,
      ...overrides.template,
    },
  };
}

describe('useGameController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getZones).mockResolvedValue({
      data: {
        zones: [
          {
            id: 'zone-forest',
            name: 'Forest Edge',
            description: null,
            difficulty: 1,
            travelCost: 10,
            isStarter: true,
            discovered: true,
            zoneType: 'wild',
            zoneExitChance: null,
            maxCraftingLevel: null,
            arrivalText: null,
            ambientTexts: null,
            environmentalTexts: null,
            exploration: null,
          },
        ],
        connections: [],
        undiscoveredZones: [],
        currentZoneId: 'zone-forest',
      },
      error: null,
    } as never);
    vi.mocked(getZoneEvents).mockResolvedValue({ data: { events: [] }, error: null } as never);
  });

  it('initializes without throwing when encounter-site refresh is passed to combat playback', () => {
    expect(() => renderHook(() => useGameController({ isAuthenticated: false }))).not.toThrow();
  });

  it('groups the world map under the Explore bottom tab', () => {
    const hook = renderHook(() => useGameController({ isAuthenticated: false }));

    act(() => {
      hook.result.current.setActiveScreen('zones');
    });

    expect(hook.result.current.getActiveTab()).toBe('explore');
  });

  it.each([
    ['skills', 'inventory'],
    ['bestiary', 'combat'],
    ['worldEvents', 'explore'],
    ['casino', 'explore'],
    ['training', 'explore'],
  ] as const)('groups %s under the %s bottom tab', (screen, tab) => {
    const hook = renderHook(() => useGameController({ isAuthenticated: false }));

    act(() => {
      hook.result.current.setActiveScreen(screen);
    });

    expect(hook.result.current.getActiveTab()).toBe(tab);
  });

  it('opens the Explore Zone screen for direct explore navigation', () => {
    const hook = renderHook(() => useGameController({ isAuthenticated: false }));

    act(() => {
      hook.result.current.handleNavigate('explore');
    });

    expect(hook.result.current.activeScreen).toBe('explore');
    expect(hook.result.current.getActiveTab()).toBe('explore');
  });

  it('opens the world map when the Explore bottom tab is selected', () => {
    const hook = renderHook(() => useGameController({ isAuthenticated: false }));

    act(() => {
      hook.result.current.handleBottomNavNavigate('explore');
    });

    expect(hook.result.current.activeScreen).toBe('zones');
    expect(hook.result.current.getActiveTab()).toBe('explore');
  });

  it('blocks a stale zone reload immediately after the active zone changes', async () => {
    const hook = renderHook(() => useGameController({ isAuthenticated: false }));

    await act(async () => {
      hook.result.current.stateSetters.setActiveZoneId('zone-forest');
    });

    await act(async () => {
      hook.result.current.stateSetters.setActiveZoneId('zone-cave');
      await hook.result.current.reloadZones({ expectedActiveZoneId: 'zone-forest' });
    });

    expect(hook.result.current.activeZoneId).toBe('zone-cave');
    expect(getZoneEvents).not.toHaveBeenCalled();
  });

  it('reveals action-added loot at or above the configured rarity threshold', () => {
    const hook = renderHook(() => useGameController({ isAuthenticated: false }));
    const commonOre = makeInventoryItem({ id: 'common-ore', rarity: 'common' });
    const rareBoots = makeInventoryItem({
      id: 'rare-boots',
      rarity: 'rare',
      template: {
        id: 'tpl-boar-hide-boots',
        name: 'Boar Hide Boots',
        itemType: 'armor',
        stackable: false,
        maxDurability: 60,
      },
    });
    const stateSetters = hook.result.current.stateSetters as typeof hook.result.current.stateSetters & {
      onInventoryAdded?: (items: InventoryItemDTO[]) => void;
    };

    act(() => {
      stateSetters.onInventoryAdded?.([commonOre, rareBoots]);
    });

    expect(hook.result.current.lootRevealItems).toEqual([
      {
        name: 'Boar Hide Boots',
        rarity: 'rare',
        quantity: 1,
        imageSrc: '/items/Boar Hide Boots',
      },
    ]);
  });

  it('refreshes crafting context after a generic state update changes the active zone', async () => {
    vi.mocked(getCraftingRecipes).mockResolvedValue({
      data: {
        recipes: [],
        zoneCraftingLevel: null,
        zoneName: 'Millbrook',
      },
      error: null,
    } as never);

    const hook = renderHook(() => useGameController({ isAuthenticated: false }));

    await act(async () => {
      await hook.result.current.handleStateUpdates({ currentZoneId: 'zone-town' });
    });

    expect(getCraftingRecipes).toHaveBeenCalledTimes(1);
    expect(hook.result.current.zoneCraftingLevel).toBeNull();
    expect(hook.result.current.zoneCraftingName).toBe('Millbrook');
  });
});
