import React from 'react';
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PREMIUM_CONSTANTS, TURN_CONSTANTS } from '@pocketrealm/shared';
import { GameScreenRenderer } from './GameScreenRenderer';

const { dashboardSpy } = vi.hoisted(() => ({
  dashboardSpy: vi.fn(),
}));
const { inventorySpy } = vi.hoisted(() => ({
  inventorySpy: vi.fn(),
}));
const { guildScreenSpy } = vi.hoisted(() => ({
  guildScreenSpy: vi.fn(),
}));
const { vexScreenSpy } = vi.hoisted(() => ({
  vexScreenSpy: vi.fn(),
}));

vi.mock('@/components/screens/Dashboard', () => ({
  Dashboard: (props: unknown) => {
    dashboardSpy(props);
    return null;
  },
}));

vi.mock('@/components/screens/Inventory', () => ({
  Inventory: (props: unknown) => {
    inventorySpy(props);
    return null;
  },
}));

vi.mock('@/components/screens/GuildScreen', () => ({
  GuildScreen: (props: unknown) => {
    guildScreenSpy(props);
    return null;
  },
}));

vi.mock('@/components/screens/VexScreen', () => ({
  VexScreen: (props: unknown) => {
    vexScreenSpy(props);
    return null;
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  dashboardSpy.mockReset();
  inventorySpy.mockReset();
  guildScreenSpy.mockReset();
  vexScreenSpy.mockReset();
});

function createBaseGc() {
  return {
    activeScreen: 'home',
    setActiveScreen: vi.fn(),
    handleNavigate: vi.fn(),
    handleBottomNavNavigate: vi.fn(),
    turns: 1200,
    setTurns: vi.fn(),
    gold: 500,
    zones: [],
    activeZoneId: null,
    zoneConnections: [],
    undiscoveredZones: [],
    reloadZones: vi.fn(),
    skills: [],
    characterProgression: {
      characterLevel: 5,
      characterXp: 500,
      attributePoints: 0,
      attributes: {
        vitality: 1,
        strength: 1,
        dexterity: 1,
        intelligence: 1,
        luck: 1,
        evasion: 1,
      },
    },
    inventory: [],
    equipment: [],
    gatheringNodes: [],
    activeGatheringSkill: 'mining',
    setActiveGatheringSkill: vi.fn(),
    craftingRecipes: [],
    activeCraftingSkill: 'weaponsmithing',
    setActiveCraftingSkill: vi.fn(),
    activityLog: [],
    pendingEncounters: [],
    pendingEncountersLoading: false,
    pendingEncountersError: null,
    pendingEncounterPage: 1,
    pendingEncounterPagination: null,
    pendingEncounterFilters: [],
    pendingEncounterZoneFilter: null,
    pendingEncounterMobFilter: null,
    pendingEncounterSort: null,
    pendingClockMs: 0,
    lastCombat: null,
    busyAction: null,
    slowAction: false,
    isOffline: false,
    actionError: null,
    bestiaryMobs: [],
    bestiaryLoading: false,
    bestiaryError: null,
    bestiaryPrefixSummary: [],
    expeditionThemes: [],
    worldBosses: [],
    hpState: {
      currentHp: 100,
      maxHp: 100,
      regenPerSecond: 1,
      isRecovering: false,
      recoveryCost: null,
    },
    setHpState: vi.fn(),
    staminaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1, restHealPerTurn: 5 },
    manaState: { current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1, restHealPerTurn: 5 },
    skillPointState: { unlockedActions: [] },
    handleAllocateSkillPoint: vi.fn(),
    handleRespecSkillPoints: vi.fn(),
    templates: [],
    handleLoadTemplates: vi.fn(),
    handleTemplateSaved: vi.fn(),
    pvpNotificationCount: 0,
    loadPvpNotificationCount: vi.fn(),
    playbackActive: false,
    combatPlaybackData: null,
    combatPlaybackQueue: null,
    combatPlaybackIndex: 0,
    roomTransition: null,
    explorationPlaybackData: null,
    travelPlaybackData: null,
    currentZone: { name: 'Starter Town', zoneType: 'town' },
    ownedByTemplateId: new Map<string, number>(),
    handleStartExploration: vi.fn(),
    handleExplorationPlaybackComplete: vi.fn(),
    handlePlaybackSkip: vi.fn(),
    handleCombatPlaybackComplete: vi.fn(),
    handleTravelPlaybackComplete: vi.fn(),
    handleTravelPlaybackSkip: vi.fn(),
    handleMine: vi.fn(),
    handleCraft: vi.fn(),
    handleGatheringPageChange: vi.fn(),
    handleGatheringZoneFilterChange: vi.fn(),
    handleGatheringResourceTypeFilterChange: vi.fn(),
    handlePendingEncounterPageChange: vi.fn(),
    handlePendingEncounterZoneFilterChange: vi.fn(),
    handlePendingEncounterMobFilterChange: vi.fn(),
    handlePendingEncounterSortChange: vi.fn(),
    handleSalvageItem: vi.fn(),
    handleSalvageBatch: vi.fn(),
    handleForgeUpgrade: vi.fn(),
    handleForgeReroll: vi.fn(),
    handleDestroyItem: vi.fn(),
    handleRepairItem: vi.fn(),
    handleRepairAllEquipped: vi.fn(),
    handleUseItem: vi.fn(),
    handleEquipItem: vi.fn(),
    handleUnequipSlot: vi.fn(),
    handleAllocateAttribute: vi.fn(),
    combatLogSpeedMs: 300,
    setCombatLogSpeedMs: vi.fn(),
    handleSetCombatLogSpeed: vi.fn(),
    explorationSpeedMs: 300,
    setExplorationSpeedMs: vi.fn(),
    handleSetExplorationSpeed: vi.fn(),
    autoSkipKnownCombat: false,
    handleSetAutoSkipKnownCombat: vi.fn(),
    defaultExploreTurns: 10,
    setDefaultExploreTurns: vi.fn(),
    handleSetDefaultExploreTurns: vi.fn(),
    quickRestHealPercent: 50,
    handleSetQuickRestHealPercent: vi.fn(),
    defaultRefiningMax: false,
    handleSetDefaultRefiningMax: vi.fn(),
    lowHpWarning: false,
    handleSetLowHpWarning: vi.fn(),
    confirmRarity: 'none',
    handleSetConfirmRarity: vi.fn(),
    lootRevealRarity: 'none',
    handleSetLootRevealRarity: vi.fn(),
    forgeConfirmRarity: 'none',
    handleSetForgeConfirmRarity: vi.fn(),
    handleQuickRest: vi.fn(),
    guildTaxRate: 0,
    homeTownId: null,
    handleSetHomeTown: vi.fn(),
    showNpcDialogue: true,
    showItemFlavourText: true,
    showBestiaryLore: true,
    handleSetShowNpcDialogue: vi.fn(),
    handleSetShowItemFlavourText: vi.fn(),
    handleSetShowBestiaryLore: vi.fn(),
    notificationPrefs: {},
    handleSetNotificationPref: vi.fn(),
    handleStateUpdates: vi.fn(),
    zoneCraftingLevel: 1,
    zoneCraftingName: 'Starter Town',
    achievementData: null,
    achievementUnclaimedCount: 0,
    activeTitle: null,
    handleClaimAchievement: vi.fn(),
    handleSetActiveTitle: vi.fn(),
    loadAchievements: vi.fn(),
    quests: [],
    questState: null,
    questsLoading: false,
    questsError: null,
    loadQuests: vi.fn(),
    handleClaimQuestReward: vi.fn(),
    handleClaimDailyBonus: vi.fn(),
    handleRerollQuest: vi.fn(),
    tutorialStep: 0,
    advanceTutorial: vi.fn(),
    starterWeaponType: null,
    loadAll: vi.fn(),
    refreshInventory: vi.fn(),
    activeBuffs: [],
    combatLogPrefetch: null,
    inventoryCapacity: 24,
    inventoryUsedSlots: 0,
    isOverEncumbered: false,
    backpackFull: false,
    trainingCooldown: 0,
    setTrainingCooldown: vi.fn(),
    handleExchangeGold: vi.fn(),
    handlePlaceBet: vi.fn(),
    handleSellItem: vi.fn(),
    handleSellBatch: vi.fn(),
    handleDepositItem: vi.fn(),
    handleDepositBatch: vi.fn(),
    handleWithdrawItem: vi.fn(),
    handleWithdrawBatch: vi.fn(),
    handleTravelToZone: vi.fn(),
    stateSetters: {},
    refreshPendingEncounters: vi.fn(),
    setActionError: vi.fn(),
    activeEncounterSiteId: null,
    setActiveEncounterSiteId: vi.fn(),
    isActivityLocked: false,
    activityLockReason: null,
    loadFriendCounts: vi.fn(),
  };
}

function renderGameScreen(
  player: { isPremium?: boolean; premiumExpiresAt?: string | null } | null,
  gcOverrides: Partial<ReturnType<typeof createBaseGc>> = {},
  propOverrides: Partial<React.ComponentProps<typeof GameScreenRenderer>> = {},
) {
  render(React.createElement(GameScreenRenderer, {
    gc: { ...createBaseGc(), ...gcOverrides },
    player,
    casinoSocket: {
      liveBets: [],
      sessionBets: [],
      sessionProfit: 0,
      lastResult: null,
      trackBet: vi.fn(),
      dealerMessages: [],
    },
    achievementCategory: null,
    setAchievementCategory: vi.fn(),
    expeditionContext: null,
    setExpeditionContext: vi.fn(),
    mailRecipient: null,
    setMailRecipient: vi.fn(),
    deepLinkTab: null,
    pushState: null,
    pushToggle: vi.fn(),
    onGuildMembershipChange: vi.fn(),
    onLogout: vi.fn(),
    onAccountRefresh: vi.fn(),
    onForceRelogin: vi.fn(),
    ...propOverrides,
  }));
}

describe('GameScreenRenderer', () => {
  it('passes Champion turn display values to Dashboard for active premium players', () => {
    renderGameScreen({
      isPremium: true,
      premiumExpiresAt: '2099-05-02T00:00:00.000Z',
    });

    expect(dashboardSpy).toHaveBeenCalledTimes(1);
    expect(dashboardSpy.mock.calls[0][0]).toMatchObject({
      playerData: {
        maxTurns: PREMIUM_CONSTANTS.TURN_BANK_CAP,
        turnsRegenRate: PREMIUM_CONSTANTS.TURN_REGEN_RATE * 60,
      },
    });
  });

  it('passes free turn display values to Dashboard for expired premium players', () => {
    renderGameScreen({
      isPremium: true,
      premiumExpiresAt: '2025-12-31T23:59:59.000Z',
    });

    expect(dashboardSpy.mock.calls[0][0]).toMatchObject({
      playerData: {
        maxTurns: TURN_CONSTANTS.BANK_CAP,
        turnsRegenRate: TURN_CONSTANTS.REGEN_RATE * 60,
      },
    });
  });

  it('routes the inventory screen and passes inventory capacity props through', () => {
    renderGameScreen(null, {
      activeScreen: 'inventory',
      inventory: [
        {
          id: 'item-1',
          quantity: 1,
          rarity: 'common',
          currentDurability: null,
          maxDurability: null,
          bonusStats: null,
          equippedSlot: null,
          template: {
            id: 'template-1',
            name: 'Torch',
            itemType: 'resource',
            weightClass: null,
            slot: null,
            tier: 1,
            baseStats: {},
            requiredSkill: null,
            requiredLevel: 1,
            maxDurability: 0,
            stackable: true,
            sellPrice: 2,
            flavorText: null,
          },
        },
      ],
      inventoryCapacity: 24,
      inventoryUsedSlots: 1,
      gold: 500,
    });

    expect(inventorySpy).toHaveBeenCalledTimes(1);
    expect(inventorySpy.mock.calls[0][0]).toMatchObject({
      capacity: 24,
      usedSlots: 1,
      gold: 500,
    });
  });

  it('forwards guild membership changes to the Guild screen', () => {
    const onGuildMembershipChange = vi.fn();

    renderGameScreen(null, { activeScreen: 'guild' }, { onGuildMembershipChange });

    expect(guildScreenSpy).toHaveBeenCalledWith(expect.objectContaining({
      onGuildMembershipChange,
    }));
  });

  it('routes the Vex screen with dialogue and state update props', () => {
    const handleStateUpdates = vi.fn();

    renderGameScreen(null, {
      activeScreen: 'vex',
      handleStateUpdates,
      showNpcDialogue: false,
    });

    expect(vexScreenSpy).toHaveBeenCalledTimes(1);
    expect(vexScreenSpy.mock.calls[0][0]).toMatchObject({
      showNpcDialogue: false,
    });

    const props = vexScreenSpy.mock.calls[0][0] as {
      onStateUpdates: (updates: { gold: number }) => void;
    };
    props.onStateUpdates({ gold: 250 });

    expect(handleStateUpdates).toHaveBeenCalledWith({ gold: 250 });
  });
});
