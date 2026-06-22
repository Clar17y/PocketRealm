import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { itemImageSrc } from '@/lib/assets';
import { getLatestVersion, CHANGELOG_STORAGE_KEY } from '@/lib/changelog';
import { useCombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';
import { useVisibleInterval } from '@/hooks/usePageVisible';
import { RARITY_RANK } from '@/lib/rarity';
import type { ForgeResultData } from '@/components/ForgeResultToast';
import {
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_STARTER_WEAPON,
  TUTORIAL_STEP_SAVE_TEMPLATE,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_COMBAT,
  TUTORIAL_STEP_TRAVEL,
  TUTORIAL_STEP_EQUIP,
  TUTORIAL_STEP_DONE,
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
  isTutorialActive,
  TUTORIAL_STEPS,
  type BottomTab,
} from '@/lib/tutorial';
import {
  getHpState,
  getResources,
  activateTemplate,
  type ApiResponse,
  type WorldEventResponse,
  type SkillPointState,
  type ProspectableResourceNodeResponse,
} from '@/lib/api';
import type { PlayerBuffData, StateUpdates, SkillStateDTO, InventoryItemDTO } from '@pocketrealm/shared';
import type { CombatTemplateData, QuestProgressUpdate, ResourceState } from '@pocketrealm/shared';
import { STAMINA_CONSTANTS, MANA_CONSTANTS, UI_TIMING_CONSTANTS } from '@pocketrealm/shared';

import { applyStateUpdates, type StateSetters } from './applyStateUpdates';
import type { Screen, PendingEncounter, LastCombat, LastCombatLogEntry, CombatPlaybackItem, CombatPlaybackQueueItem, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { DEFAULT_CHARACTER_PROGRESSION } from './gameController.types';
export type { Screen, PendingEncounter, LastCombat, LastCombatLogEntry, CombatPlaybackItem, CombatPlaybackQueueItem, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { buildLastCombat, isMobKnown } from './combatHelpers';
export { isMobKnown } from './combatHelpers';
import { useActivityLog, nowStamp } from './hooks/useActivityLog';
import { usePlayerSettings } from './hooks/usePlayerSettings';
import { useBestiary } from './hooks/useBestiary';
import { useGathering } from './hooks/useGathering';
import { useEncounterSites } from './hooks/useEncounterSites';
import { useAchievements } from './hooks/useAchievements';
import { useQuests } from './hooks/useQuests';
import { useCombatPlayback } from './hooks/useCombatPlayback';
import { runSimpleAction } from './simpleAction';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { SCREEN_POLL_NEEDS, useGamePolling } from './hooks/useGamePolling';
import { useInventoryActions } from './hooks/useInventoryActions';
import { useLootActions } from './hooks/useLootActions';
import { useExplorationActions } from './hooks/useExplorationActions';
import { useSocialCounts } from './hooks/useSocialCounts';
import { useTutorialProgression } from './hooks/useTutorialProgression';
import { useTravelActions } from './hooks/useTravelActions';
import { useGameBootstrap } from './hooks/useGameBootstrap';
import { useGatheringActions } from './hooks/useGatheringActions';
import { useCraftingActions } from './hooks/useCraftingActions';
import { useResourceActions } from './hooks/useResourceActions';
import { useCasinoActions } from './hooks/useCasinoActions';

type LootRevealItem = {
  name: string;
  rarity: InventoryItemDTO['rarity'];
  quantity: number;
  imageSrc?: string;
};

type BottomNavTarget = 'explore' | 'social';

const bottomTabDefaults: Record<BottomNavTarget, Screen> = {
  explore: 'zones',
  social: 'guild',
};

const isBottomNavTarget = (screen: string): screen is BottomNavTarget => screen in bottomTabDefaults;

export function useGameController({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [activeScreen, setActiveScreen] = useState<Screen>('home');
  const [turns, setTurns] = useState(0);
  const [gold, setGold] = useState(0);
  const [activeBuffs, setActiveBuffs] = useState<PlayerBuffData[]>([]);
  const [trainingCooldown, setTrainingCooldown] = useState(0);
  const [zones, setZones] = useState<Array<{
    id: string;
    name: string;
    description: string | null;
    difficulty: number;
    travelCost: number;
    isStarter: boolean;
    discovered: boolean;
    zoneType: string;
    zoneExitChance: number | null;
    maxCraftingLevel: number | null;
    arrivalText: string | null;
    ambientTexts: Record<string, string> | null;
    environmentalTexts: Record<string, string> | null;
    trackableMobFamilies?: Array<{ mobFamilyId: string; name: string; minTier: number }>;
    prospectableResourceNodes?: ProspectableResourceNodeResponse[];
    exploration: {
      turnsExplored: number;
      turnsToExplore: number | null;
      percent: number;
      tiers: Record<string, number> | null;
    } | null;
  }>>([]);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [zoneConnections, setZoneConnections] = useState<Array<{ fromId: string; toId: string; explorationThreshold: number }>>([]);
  const [undiscoveredZones, setUndiscoveredZones] = useState<Array<{ id: string; name: string; explorationThreshold: number; fromZoneId: string; discovered: false }>>([]);
  const [skills, setSkills] = useState<SkillStateDTO[]>([]);
  const [characterProgression, setCharacterProgression] = useState<CharacterProgression>(DEFAULT_CHARACTER_PROGRESSION);
  const [inventory, setInventory] = useState<InventoryItemDTO[]>([]);
  const [inventoryCapacity, setInventoryCapacity] = useState(24);
  const [inventoryUsedSlots, setInventoryUsedSlots] = useState(0);
  const [materialTotals, setMaterialTotals] = useState<Record<string, number>>({});
  const [equipment, setEquipment] = useState<Array<{
    slot: string;
    itemId: string | null;
    item: null | {
      id: string;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      currentDurability: number | null;
      maxDurability: number | null;
      bonusStats: Record<string, number> | null;
      template: {
        id: string;
        name: string;
        itemType: string;
        weightClass?: 'heavy' | 'medium' | 'light' | null;
        slot: string | null;
        tier: number;
        baseStats: Record<string, unknown>;
        requiredSkill?: string | null;
        requiredLevel?: number;
        maxDurability?: number;
        stackable?: boolean;
      };
    };
  }>>([]);
  const [zoneCraftingLevel, setZoneCraftingLevel] = useState<number | null>(0);
  const [zoneCraftingName, setZoneCraftingName] = useState<string | null>(null);
  const [craftingRecipes, setCraftingRecipes] = useState<Array<{
    id: string;
    skillType: string;
    requiredLevel: number;
    isAdvanced: boolean;
    isDiscovered: boolean;
    discoveryHint: string | null;
    soulbound: boolean;
    mobFamilyId: string | null;
    resultTemplate: { id: string; name: string; itemType: string; weightClass?: 'heavy' | 'medium' | 'light' | null; setId?: string | null; slot: string | null; tier: number; baseStats: Record<string, unknown>; stackable: boolean; maxDurability: number; requiredSkill: string | null; requiredLevel: number };
    turnCost: number;
    materials: Array<{ templateId: string; quantity: number }>;
    materialTemplates: Array<{ id: string; name: string; itemType: string; stackable: boolean }>;
    xpReward: number;
  }>>([]);
  const [activeCraftingSkill, setActiveCraftingSkill] = useState<'refining' | 'tanning' | 'weaving' | 'weaponsmithing' | 'armorsmithing' | 'leatherworking' | 'tailoring' | 'alchemy' | 'jewelcrafting'>('weaponsmithing');
  const { activityLog, setActivityLog, pushLog } = useActivityLog();
  const [lastCombat, setLastCombat] = useState<LastCombat | null>(null);
  const connectionStatus = useConnectionStatus();
  const isOffline = connectionStatus !== 'connected';
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [slowAction, setSlowAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { bestiaryMobs, bestiaryLoading, bestiaryError, bestiaryPrefixSummary, expeditionThemes, worldBosses, loadBestiary } = useBestiary(isAuthenticated, activeScreen);
  const [hpState, setHpState] = useState<HpState>({ currentHp: 100, maxHp: 100, regenPerSecond: 0.4, isRecovering: false, recoveryCost: null });
  const [activeEncounterSiteId, setActiveEncounterSiteId] = useState<string | null>(null);
  const [hasActiveExpedition, setHasActiveExpedition] = useState(false);
  const [staminaState, setStaminaState] = useState<ResourceState>({
    current: STAMINA_CONSTANTS.BASE_POOL, max: STAMINA_CONSTANTS.BASE_POOL,
    regenPerRound: 10, regenPerSecond: 1, restHealPerTurn: 5
  });
  const [manaState, setManaState] = useState<ResourceState>({
    current: MANA_CONSTANTS.BASE_POOL, max: MANA_CONSTANTS.BASE_POOL,
    regenPerRound: 5, regenPerSecond: 0.5, restHealPerTurn: 3
  });
  const [skillPointState, setSkillPointState] = useState<SkillPointState | null>(null);
  const [templates, setTemplates] = useState<CombatTemplateData[]>([]);
  const [pvpNotificationCount, setPvpNotificationCount] = useState(0);
  const [incomingFriendRequestCount, setIncomingFriendRequestCount] = useState(0);
  const [mailUnreadCount, setMailUnreadCount] = useState(0);
  const [activeEvents, setActiveEvents] = useState<WorldEventResponse[]>([]);
  const playerSettings = usePlayerSettings();
  const {
    combatLogSpeedMs, setCombatLogSpeedMs,
    explorationSpeedMs, setExplorationSpeedMs,
    autoSkipKnownCombat,
    defaultExploreTurns, setDefaultExploreTurns,
    quickRestHealPercent, setQuickRestHealPercent,
    defaultRefiningMax,
    lowHpWarning,
    confirmRarity,
    lootRevealRarity,
    forgeConfirmRarity,
    guildTaxRate, setGuildTaxRate,
    showNpcDialogue,
    showItemFlavourText,
    showBestiaryLore,
    handleSetCombatLogSpeed,
    handleSetExplorationSpeed,
    handleSetAutoSkipKnownCombat,
    handleSetDefaultExploreTurns,
    handleSetQuickRestHealPercent,
    handleSetDefaultRefiningMax,
    handleSetLowHpWarning,
    handleSetConfirmRarity,
    handleSetLootRevealRarity,
    handleSetForgeConfirmRarity,
    initSettingsFromServer,
  } = playerSettings;
  const [tutorialStep, setTutorialStep] = useState<number>(TUTORIAL_COMPLETED);
  const [starterWeaponType, setStarterWeaponType] = useState<'melee' | 'ranged' | 'magic' | null>(null);
  const combatLogPrefetch = useCombatLogPrefetch();
  const [playbackActive, setPlaybackActive] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const activatePendingLootRef = useRef<(sessionId: string) => Promise<void>>(async () => {});
  const pendingLootQueueRef = useRef<string[]>([]);
  const lastEventLogTimeRef = useRef(0);
  const prevInventoryIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOnceRef = useRef(false);
  const sessionTrackedRef = useRef(false);
  const playerCreatedAtRef = useRef<string | null>(null);
  const lootRevealRarityRef = useRef(lootRevealRarity);
  lootRevealRarityRef.current = lootRevealRarity;
  const [lootRevealItems, setLootRevealItems] = useState<LootRevealItem[] | null>(null);
  const hpStateRef = useRef(hpState);
  useEffect(() => {
    hpStateRef.current = hpState;
  }, [hpState]);
  const activeZoneIdRef = useRef(activeZoneId);
  useEffect(() => {
    activeZoneIdRef.current = activeZoneId;
  }, [activeZoneId]);
  const setActiveZoneIdImmediate = useCallback((nextZoneId: string | null) => {
    activeZoneIdRef.current = nextZoneId;
    setActiveZoneId(nextZoneId);
  }, []);
  const staminaStateRef = useRef(staminaState);
  useEffect(() => {
    staminaStateRef.current = staminaState;
  }, [staminaState]);
  const manaStateRef = useRef(manaState);
  useEffect(() => {
    manaStateRef.current = manaState;
  }, [manaState]);

  const showLootRevealForItems = useCallback((items: InventoryItemDTO[]) => {
    for (const item of items) {
      prevInventoryIdsRef.current.add(item.id);
    }

    if (lootRevealRarityRef.current === 'none') return;

    const minRank = RARITY_RANK[lootRevealRarityRef.current] ?? RARITY_RANK.uncommon;
    const notableItems = items.filter((item) => (RARITY_RANK[item.rarity] ?? -1) >= minRank);
    if (notableItems.length === 0) return;

    setLootRevealItems(notableItems.map((item) => ({
      name: item.template.name,
      rarity: item.rarity,
      quantity: item.quantity,
      imageSrc: itemImageSrc(item.template.name, item.template.itemType),
    })));
  }, [lootRevealRarityRef, prevInventoryIdsRef]);

  const activeScreenRef = useRef(activeScreen);
  useEffect(() => { activeScreenRef.current = activeScreen; }, [activeScreen]);

  const gathering = useGathering(isAuthenticated, activeScreen, activeZoneId);
  const { loadGatheringNodes, setActiveGatheringSkill } = gathering;
  const encounterSites = useEncounterSites(isAuthenticated, activeScreen, activeZoneId);
  const { refreshPendingEncounters, pendingEncounters } = encounterSites;

  // Immediate fetch when navigating to a screen that needs HP/resources and values are below max
  useEffect(() => {
    if (!isAuthenticated) return;
    const needs = SCREEN_POLL_NEEDS[activeScreen] ?? ['turns'];

    const hpRef = hpStateRef.current;
    const stamRef = staminaStateRef.current;
    const manaRef = manaStateRef.current;

    const needsHpFetch = needs.includes('hp') && hpRef.currentHp < hpRef.maxHp;
    const needsResourceFetch = needs.includes('resources') &&
      (stamRef.current < stamRef.max || manaRef.current < manaRef.max);

    if (!needsHpFetch && !needsResourceFetch) return;

    const fetches: Promise<void>[] = [];
    if (needsHpFetch) {
      fetches.push(getHpState().then(res => {
        if (res.data) { setHpState(res.data); hpStateRef.current = res.data; }
      }));
    }
    if (needsResourceFetch) {
      fetches.push(getResources().then(res => {
        if (res.data) {
          setStaminaState(res.data.stamina); setManaState(res.data.mana);
          staminaStateRef.current = res.data.stamina; manaStateRef.current = res.data.mana;
        }
      }));
    }
    void Promise.all(fetches);
  }, [activeScreen, isAuthenticated]); // intentionally excludes HP/resource state — only re-run on screen change

  const stateSetters = useMemo<StateSetters>(() => ({
    setInventory: (updater) => setInventory(updater),
    onInventoryAdded: showLootRevealForItems,
    setInventoryCapacity,
    setInventoryUsedSlots,
    setEquipment: (eq) => setEquipment(
      Object.entries(eq).map(([slot, item]) => ({
        slot,
        itemId: item?.id ?? null,
        item,
      })),
    ),
    patchEquipmentDurability: (patches) => setEquipment((prev) => {
      let changed = false;
      const next = prev.map((slot) => {
        if (!slot.item || !slot.itemId) return slot;
        const patch = patches.get(slot.itemId);
        if (!patch) return slot;
        changed = true;
        return { ...slot, item: { ...slot.item, currentDurability: patch.currentDurability, maxDurability: patch.maxDurability } };
      });
      return changed ? next : prev;
    }),
    setSkills,
    setHpState: (hp) => { setHpState(hp); hpStateRef.current = hp; },
    setStaminaState: (partial) => setStaminaState((prev) => ({ ...prev, ...partial })),
    setManaState: (partial) => setManaState((prev) => ({ ...prev, ...partial })),
    setGold,
    setActiveBuffs: setActiveBuffs,
    setCharacterProgression: (cp) => setCharacterProgression((prev) => ({ ...prev, ...cp })),
    setMaterialTotals,
    setActiveEncounterSiteId,
    setActiveZoneId: setActiveZoneIdImmediate,
  }), [setActiveZoneIdImmediate, showLootRevealForItems]);
  // State setters are stable; only ref-synchronizing callbacks need to stay in deps.

  const runAction = async (actionName: string, fn: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(actionName);
    setActionError(null);
    setSlowAction(false);
    const timer = setTimeout(() => setSlowAction(true), UI_TIMING_CONSTANTS.SLOW_ACTION_THRESHOLD_MS);
    try {
      await fn();
    } finally {
      clearTimeout(timer);
      setBusyAction(null);
      setSlowAction(false);
    }
  };

  // Helper for simple API-call-then-stateUpdates actions
  const simpleAction = async <T>(
    actionName: string,
    apiFn: () => Promise<ApiResponse<T>>,
    onSuccess?: (data: T) => void | Promise<void>,
  ) => {
    await runAction(actionName, async () => {
      await runSimpleAction({
        actionName,
        apiFn,
        onSuccess: async (data) => {
          applyStateUpdates((data as { stateUpdates?: StateUpdates }).stateUpdates, stateSetters);
          await onSuccess?.(data);
        },
        setActionError,
      });
    });
  };

  const pollScreenData = useGamePolling({
    activeScreenRef,
    hpStateRef,
    staminaStateRef,
    manaStateRef,
    setTurns,
    setHpState,
    setStaminaState,
    setManaState,
  });

  const { loadPvpNotificationCount, loadFriendCounts } = useSocialCounts({
    setPvpNotificationCount,
    setIncomingFriendRequestCount,
    setMailUnreadCount,
  });

  const syncHpState = useCallback((nextState: HpState) => {
    setHpState(nextState);
    hpStateRef.current = nextState;
  }, []);

  const syncStaminaState = useCallback((nextState: ResourceState) => {
    setStaminaState(nextState);
    staminaStateRef.current = nextState;
  }, []);

  const syncManaState = useCallback((nextState: ResourceState) => {
    setManaState(nextState);
    manaStateRef.current = nextState;
  }, []);

  const {
    refreshCraftingRecipes,
    handleLoadSkillPoints,
    handleAllocateSkillPoint,
    handleRespecSkillPoints,
    handleLoadTemplates,
    reloadZones,
    loadAll,
  } = useGameBootstrap({
    tutorialStep,
    activeZoneIdRef,
    playerCreatedAtRef,
    hasLoadedOnceRef,
    prevInventoryIdsRef,
    lootRevealRarityRef,
    initSettingsFromServer,
    setActionError,
    setTurns,
    setCharacterProgression,
    setGold,
    setActiveEncounterSiteId,
    setTutorialStep,
    setShowChangelog,
    setSkills,
    setHpState: syncHpState,
    setStaminaState: syncStaminaState,
    setManaState: syncManaState,
    setSkillPointState,
    setActiveBuffs,
    setHasActiveExpedition,
    setZones,
    setZoneConnections,
    setUndiscoveredZones,
    setActiveZoneId: setActiveZoneIdImmediate,
    setActiveEvents,
    setInventory,
    setInventoryCapacity,
    setInventoryUsedSlots,
    setMaterialTotals,
    setLootRevealItems,
    setEquipment,
    setCraftingRecipes,
    setZoneCraftingLevel,
    setZoneCraftingName,
    setTemplates,
    setGuildTaxRate,
  });

  const achievements = useAchievements(isAuthenticated, loadAll);
  const {
    achievementData, achievementUnclaimedCount, activeTitle,
    loadAchievements, loadAchievementUnclaimedCount,
    handleClaimAchievement, handleSetActiveTitle,
  } = achievements;

  const {
    quests, questState, questsLoading, questsError,
    loadQuests, handleClaimQuestReward, handleClaimDailyBonus, handleRerollQuest,
    updateQuestProgress,
  } = useQuests();
  const {
    advanceTutorial,
    skipTutorial,
    handleTemplateSaved,
    handleClaimStarterWeapon,
  } = useTutorialProgression({
    tutorialStep,
    setTutorialStep,
    setActiveGatheringSkill,
    setActiveCraftingSkill,
    setStarterWeaponType,
    loadAll,
    handleLoadTemplates,
  });

  const combatPlayback = useCombatPlayback({
    combatLogPrefetch,
    setLastCombat,
    setPlaybackActive,
    refreshPendingEncounters,
    reloadZones,
    advanceTutorial,
    activeZoneIdRef,
    activatePendingLootRef,
  });
  const {
    combatPlaybackQueue, setCombatPlaybackQueue,
    combatPlaybackIndex, setCombatPlaybackIndex,
    roomTransition, setRoomTransition,
    combatPlaybackData,
    pendingCombatRewardsRef, siteJustClearedRef, combatPendingLootRef,
    handleCombatPlaybackComplete,
  } = combatPlayback;

  // Initial one-shot loads
  useEffect(() => {
    if (!isAuthenticated) return;
    void loadAll();
    void loadPvpNotificationCount();
    void loadFriendCounts();
  }, [isAuthenticated, loadAll, loadPvpNotificationCount, loadFriendCounts]);

  // Recurring polls pause unless the page is visible, focused, and recently active.
  useVisibleInterval(() => void pollScreenData(), 10000, isAuthenticated);
  useVisibleInterval(() => void loadPvpNotificationCount(), 60000, isAuthenticated);
  useVisibleInterval(() => void loadFriendCounts(), 60000, isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated || sessionTrackedRef.current || characterProgression.characterLevel === 0) return;
    sessionTrackedRef.current = true;
    const daysSinceSignup = playerCreatedAtRef.current
      ? Math.floor((Date.now() - new Date(playerCreatedAtRef.current).getTime()) / 86_400_000)
      : 0;
    trackEvent('session_start', { characterLevel: characterProgression.characterLevel, daysSinceSignup });
  }, [isAuthenticated, characterProgression.characterLevel]);

  useEffect(() => {
    const handler = () => trackEvent('pwa_install');
    window.addEventListener('appinstalled', handler);
    return () => window.removeEventListener('appinstalled', handler);
  }, []);

  const getActiveTab = () => {
    if (['home', 'achievements', 'quests', 'leaderboard', 'admin'].includes(activeScreen)) return 'home';
    if (['zones', 'explore', 'gathering', 'crafting', 'forge', 'worldEvents', 'casino', 'training'].includes(activeScreen)) return 'explore';
    if (['inventory', 'equipment', 'skills'].includes(activeScreen)) return 'inventory';
    if (['combat', 'arena', 'templates', 'talentTree', 'bestiary'].includes(activeScreen)) return 'combat';
    if (['guild', 'friends', 'mail'].includes(activeScreen)) return 'social';
    return 'home';
  };

  const logActiveEvents = (events: Array<{ title: string; effectType: string; effectValue: number }> | undefined) => {
    if (!events?.length) return;
    const now = Date.now();
    if (now - lastEventLogTimeRef.current < 5 * 60 * 1000) return;
    lastEventLogTimeRef.current = now;
    for (const evt of events) {
      const sign = evt.effectType.endsWith('_down') ? '-' : '+';
      pushLog({ timestamp: nowStamp(), type: 'info', message: `World event active: ${evt.title} (${sign}${Math.round(evt.effectValue * 100)}%)` });
    }
  };

  const currentZone = useMemo(() =>
    zones.find((z) => z.id === activeZoneId) ??
    zones.find((z) => z.discovered) ??
    zones.find((z) => z.isStarter) ??
    null, [zones, activeZoneId]);

  const ownedByTemplateId = useMemo(() => {
    const map = new Map<string, number>();
    for (const [templateId, qty] of Object.entries(materialTotals)) {
      map.set(templateId, qty);
    }
    return map;
  }, [materialTotals]);

  // === Domain hooks ===
  const loot = useLootActions({
    runAction, pushLog, setActionError, stateSetters,
    activatePendingLootRef, pendingLootQueueRef,
  });

  const explorationActions = useExplorationActions({
    hpStateRef, currentZone, runAction, pushLog,
    setTurns, setActionError, setPlaybackActive, stateSetters,
    advanceTutorial,
    combatLogPrefetchClear: combatLogPrefetch.clear,
    refreshPendingEncounters, loadGatheringNodes,
    pendingLootQueueRef, activatePendingLoot: loot.activatePendingLoot,
    updateZoneExploration: (zoneId, exploration) => {
      setZones(prev => prev.map(z => z.id === zoneId ? { ...z, exploration: { ...z.exploration, ...exploration, tiers: z.exploration?.tiers ?? null } } : z));
    },
    updateQuestProgress,
    reloadZones,
    refreshCraftingRecipes,
  });

  const travelActions = useTravelActions({
    hpStateRef, activeZoneId, zones, zoneConnections,
    runAction, pushLog, setTurns, setActiveZoneId: setActiveZoneIdImmediate, setActionError,
    setPlaybackActive, stateSetters, advanceTutorial,
    refreshCraftingRecipes, loadAll,
    pendingLootSession: loot.pendingLootSession,
    clearPendingLootSession: () => loot.setPendingLootSession(null),
    reloadPendingLootSession: loot.reloadPendingLootSession,
    pendingLootQueueRef,
    activateNextQueuedLoot: loot.activateNextQueuedLoot,
    logDurabilityWarnings: explorationActions.logDurabilityWarnings,
  });

  const inventoryActions = useInventoryActions({
    simpleAction, pushLog, setTurns, setGold, advanceTutorial,
  });

  const gatheringActions = useGatheringActions({
    activeZoneId,
    runAction,
    pushLog,
    setTurns,
    setActionError,
    stateSetters,
    updateQuestProgress,
    loadGatheringNodes,
    advanceTutorial,
    logActiveEvents,
  });

  const craftingActions = useCraftingActions({
    craftingRecipes,
    runAction,
    pushLog,
    setTurns,
    setActionError,
    stateSetters,
    updateQuestProgress,
    advanceTutorial,
  });

  const resourceActions = useResourceActions({
    hpState,
    staminaState,
    manaState,
    turns,
    quickRestHealPercent,
    tutorialStep,
    runAction,
    pushLog,
    setTurns,
    setActionError,
    setCharacterProgression,
    setHpState,
    stateSetters,
    advanceTutorial,
  });

  const casinoActions = useCasinoActions({ setGold, setTurns });

  const navigateToScreen = (screen: string) => {
    // Auto-skip any active playback when navigating away
    if (playbackActive) {
      if (explorationActions.explorationPlaybackData) {
        void explorationActions.handlePlaybackSkip();
      }
      if (combatPlaybackQueue) {
        // Skip to the end of the queue
        const lastFight = combatPlaybackQueue[combatPlaybackQueue.length - 1];
        if (lastFight) {
          const aggregatedRewards = pendingCombatRewardsRef.current ?? lastFight.rewards;
          setLastCombat(buildLastCombat(combatPlaybackQueue, aggregatedRewards));
        }
        setCombatPlaybackQueue(null);
        setCombatPlaybackIndex(0);
        setRoomTransition(null);
        pendingCombatRewardsRef.current = null;
        combatLogPrefetch.clear();
        void refreshPendingEncounters();
      }
      if (travelActions.travelPlaybackData) {
        void travelActions.handleTravelPlaybackSkip();
      }
    }
    // Clear last combat log when leaving the combat screen — it's in history if needed
    if (activeScreen === 'combat' && screen !== 'combat') {
      setLastCombat(null);
    }
    setActiveScreen(screen as Screen);
    trackEvent('screen_view', { screen });
  };

  const handleNavigate = (screen: string) => {
    navigateToScreen(screen);
  };

  const handleBottomNavNavigate = (screen: string) => {
    navigateToScreen(isBottomNavTarget(screen) ? bottomTabDefaults[screen] : screen);
  };

  const dismissChangelog = useCallback(() => {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, getLatestVersion());
    setShowChangelog(false);
  }, []);

  const openChangelog = useCallback(() => setShowChangelog(true), []);

  const handleDismissLootReveal = useCallback(() => {
    setLootRevealItems(null);
  }, []);

  const handleStateUpdates = useCallback(async (updates: StateUpdates) => {
    applyStateUpdates(updates, stateSetters);
    if (updates.currentZoneId !== undefined) {
      await refreshCraftingRecipes().catch(() => undefined);
    }
  }, [refreshCraftingRecipes, stateSetters]);

  return {
    // Navigation
    activeScreen,
    setActiveScreen,
    handleNavigate,
    handleBottomNavNavigate,
    getActiveTab,
    handleTravelToZone: travelActions.handleTravelToZone,
    confirmAbandonLoot: travelActions.confirmAbandonLoot,
    abandonLootAndTravel: travelActions.abandonLootAndTravel,
    cancelAbandonLoot: travelActions.cancelAbandonLoot,

    // Core state
    turns,
    setTurns,
    gold,
    setGold,
    activeBuffs,
    trainingCooldown,
    setTrainingCooldown,
    zones,
    activeZoneId,
    zoneConnections,
    undiscoveredZones,
    reloadZones,
    skills,
    characterProgression,
    inventory,
    equipment,
    ...gathering,
    ...encounterSites,
    craftingRecipes,
    zoneCraftingLevel,
    zoneCraftingName,
    activeCraftingSkill,
    setActiveCraftingSkill,
    activityLog,
    pushLog,
    lastCombat,
    busyAction,
    slowAction,
    isOffline,
    actionError,
    bestiaryMobs,
    bestiaryLoading,
    bestiaryError,
    bestiaryPrefixSummary,
    expeditionThemes,
    worldBosses,
    hpState,
    setHpState,
    staminaState,
    manaState,
    skillPointState,
    setSkillPointState,
    handleLoadSkillPoints,
    handleAllocateSkillPoint,
    handleRespecSkillPoints,
    templates,
    handleLoadTemplates,
    handleTemplateSaved,
    pvpNotificationCount,
    incomingFriendRequestCount,
    mailUnreadCount,
    loadFriendCounts,
    combatLogSpeedMs,
    setCombatLogSpeedMs,
    explorationSpeedMs,
    setExplorationSpeedMs,
    autoSkipKnownCombat,
    defaultExploreTurns,
    setDefaultExploreTurns,
    quickRestHealPercent,
    defaultRefiningMax,
    lowHpWarning,
    handleSetLowHpWarning,
    confirmRarity,
    handleSetConfirmRarity,
    lootRevealRarity,
    handleSetLootRevealRarity,
    forgeConfirmRarity,
    handleSetForgeConfirmRarity,
    playbackActive,
    combatPlaybackData,
    combatPlaybackQueue,
    combatPlaybackIndex,
    roomTransition,
    explorationPlaybackData: explorationActions.explorationPlaybackData,
    travelPlaybackData: travelActions.travelPlaybackData,

    // Achievements
    achievementData,
    achievementUnclaimedCount,
    activeTitle,
    handleClaimAchievement,
    handleSetActiveTitle,
    loadAchievements,

    // Quests
    quests,
    questState,
    questsLoading,
    questsError,
    loadQuests,
    handleClaimQuestReward,
    handleClaimDailyBonus,
    handleRerollQuest,
    updateQuestProgress,

    // Tutorial
    tutorialStep, skipTutorial, advanceTutorial, handleClaimStarterWeapon, starterWeaponType,

    // Combat log lazy loading
    combatLogPrefetch,

    // Guild
    guildTaxRate,

    // Home Town
    homeTownId: playerSettings.homeTownId,
    handleSetHomeTown: playerSettings.handleSetHomeTown,

    // Lore & Flavour preferences
    showNpcDialogue,
    showItemFlavourText,
    showBestiaryLore,
    handleSetShowNpcDialogue: playerSettings.handleSetShowNpcDialogue,
    handleSetShowItemFlavourText: playerSettings.handleSetShowItemFlavourText,
    handleSetShowBestiaryLore: playerSettings.handleSetShowBestiaryLore,

    // Notification preferences
    notificationPrefs: playerSettings.notificationPrefs,
    handleSetNotificationPref: playerSettings.handleSetNotificationPref,

    // Changelog
    showChangelog,
    dismissChangelog,
    openChangelog,

    // World Events
    activeEvents,

    // Derived
    currentZone,
    ownedByTemplateId,

    // Actions
    handleStartExploration: explorationActions.handleStartExploration,
    handleExplorationPlaybackComplete: explorationActions.handleExplorationPlaybackComplete,
    handlePlaybackSkip: explorationActions.handlePlaybackSkip,
    handleCombatPlaybackComplete,
    handleTravelPlaybackComplete: travelActions.handleTravelPlaybackComplete,
    handleTravelPlaybackSkip: travelActions.handleTravelPlaybackSkip,
    handleMine: gatheringActions.handleMine,
    handleCraft: craftingActions.handleCraft,
    ...inventoryActions,
    handleAllocateAttribute: resourceActions.handleAllocateAttribute,
    loadAll,
    loadPvpNotificationCount,
    handleSetCombatLogSpeed,
    handleSetExplorationSpeed,
    handleSetAutoSkipKnownCombat,
    handleSetDefaultExploreTurns,
    handleSetQuickRestHealPercent,
    handleSetDefaultRefiningMax,
    handleQuickRest: resourceActions.handleQuickRest,

    // Inventory & backpack
    inventoryCapacity,
    inventoryUsedSlots,
    isOverEncumbered: inventoryUsedSlots > inventoryCapacity,
    backpackFull: inventoryUsedSlots >= inventoryCapacity,
    pendingLootSession: loot.pendingLootSession,
    activatePendingLoot: loot.activatePendingLoot,
    handleClaimLoot: loot.handleClaimLoot,
    handleDismissLoot: loot.handleDismissLoot,
    handleReopenLoot: loot.handleReopenLoot,

    // State update helpers
    stateSetters,

    // Casino & Training
    handleExchangeGold: casinoActions.handleExchangeGold,
    handlePlaceBet: casinoActions.handlePlaceBet,

    // Loot reveal
    lootRevealItems,
    handleDismissLootReveal,
    handleStateUpdates,

    // Encounter site combat
    refreshPendingEncounters,
    setActionError,
    activeEncounterSiteId,
    setActiveEncounterSiteId,

    // Activity lock (encounter site / expedition in progress)
    isActivityLocked: !!activeEncounterSiteId || hasActiveExpedition,
    activityLockReason: activeEncounterSiteId ? 'encounter' as const : hasActiveExpedition ? 'expedition' as const : null,
  };
}
