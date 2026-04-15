import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trackEvent, trackOnce } from '@/lib/analytics';
import { itemImageSrc } from '@/lib/assets';
import { getLatestVersion, CHANGELOG_STORAGE_KEY } from '@/lib/changelog';
import { RARITY_RANK } from '@/lib/rarity';
import { useCombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';
import { useVisibleInterval } from '@/hooks/usePageVisible';
import type { ForgeResultData } from '@/components/ForgeResultToast';
import { updateTutorialStep, claimStarterWeapon } from '@/lib/api';
import {
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_STARTER_WEAPON,
  TUTORIAL_STEP_SKILL_POINTS,
  TUTORIAL_STEP_SAVE_TEMPLATE,
  TUTORIAL_STEP_ATTRIBUTE_POINTS,
  TUTORIAL_STEP_EXPLORE,
  TUTORIAL_STEP_COMBAT,
  TUTORIAL_STEP_GATHER,
  TUTORIAL_STEP_TRAVEL,
  TUTORIAL_STEP_REFINE,
  TUTORIAL_STEP_CRAFT,
  TUTORIAL_STEP_EQUIP,
  TUTORIAL_STEP_DONE,
  TUTORIAL_COMPLETED,
  TUTORIAL_SKIPPED,
  isTutorialActive,
  TUTORIAL_STEPS,
  type BottomTab,
} from '@/lib/tutorial';
import {
  allocatePlayerAttribute,
  craft,
  getCraftingRecipes,
  getEquipment,
  getHpState,
  getInventory,
  getPlayer,
  getPlayerGuild,
  getPvpNotificationCount,
  getSkills,
  getTurns,
  getZones,
  getZoneEvents,
  mine,
  rest,
  restEstimate,
  getResources,
  getSkillPointState,
  allocateSkillPoint,
  respecSkillPoints,
  getTemplates,
  activateTemplate,
  type ApiResponse,
  type WorldEventResponse,
  type SkillPointState,
  exchangeGold,
  placeRouletteBet,
  getIncomingFriendRequests,
  getFriendMailUnreadCount,
  getPlayerBuffs,
  getExpeditionCooldowns,
} from '@/lib/api';
import type { PlayerBuffData, StateUpdates, SkillStateDTO, InventoryItemDTO } from '@pocketrealm/shared';
import type { CombatTemplateData, QuestProgressUpdate, ResourceState } from '@pocketrealm/shared';
import type { RouletteBetType } from '@pocketrealm/shared';
import { STAMINA_CONSTANTS, MANA_CONSTANTS, UI_TIMING_CONSTANTS } from '@pocketrealm/shared';

import { applyStateUpdates, type StateSetters } from './applyStateUpdates';
import { prettyStatName, formatStatValue } from '@/lib/statFormat';
import type { Screen, PendingEncounter, LastCombat, LastCombatLogEntry, CombatPlaybackItem, CombatPlaybackQueueItem, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { DEFAULT_CHARACTER_PROGRESSION } from './gameController.types';
export type { Screen, PendingEncounter, LastCombat, LastCombatLogEntry, CombatPlaybackItem, CombatPlaybackQueueItem, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { buildLastCombat, isMobKnown } from './combatHelpers';
export { isMobKnown } from './combatHelpers';
import { useActivityLog, nowStamp } from './hooks/useActivityLog';
import { recordTurnsSpent } from '../../lib/activityTracker';
import { usePlayerSettings } from './hooks/usePlayerSettings';
import { useBestiary } from './hooks/useBestiary';
import { useGathering } from './hooks/useGathering';
import { useEncounterSites } from './hooks/useEncounterSites';
import { useAchievements } from './hooks/useAchievements';
import { useQuests } from './hooks/useQuests';
import { useCombatPlayback } from './hooks/useCombatPlayback';
import { runSimpleAction } from './simpleAction';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useInventoryActions } from './hooks/useInventoryActions';
import { useLootActions } from './hooks/useLootActions';
import { useExplorationActions } from './hooks/useExplorationActions';
import { useTravelActions } from './hooks/useTravelActions';

type AttributeType = keyof CharacterProgression['attributes'];

const SCREEN_POLL_NEEDS: Record<string, string[]> = {
  explore: ['turns', 'hp', 'resources'],
  combat: ['turns', 'hp', 'resources'],
  rest: ['turns', 'hp', 'resources'],
  home: ['turns', 'hp', 'resources'],
  arena: ['turns', 'hp', 'resources'],
  travel: ['turns', 'hp', 'resources'],
  gathering: ['turns'],
  crafting: ['turns'],
  forge: ['turns'],
  casino: ['turns'],
  skills: ['turns'],
  zones: ['turns'],
  bestiary: ['turns'],
  training: ['turns'],
};

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
  const [lootRevealItems, setLootRevealItems] = useState<Array<{
    name: string;
    rarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
    quantity: number;
    imageSrc?: string;
  }> | null>(null);
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
  }), [setActiveZoneIdImmediate]);
  // State setters are stable; only the ref-synchronizing zone setter needs to stay in deps.

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

  const pollScreenData = useCallback(async () => {
    const needs = SCREEN_POLL_NEEDS[activeScreenRef.current] ?? ['turns'];
    const fetches: Promise<void>[] = [];

    fetches.push(getTurns().then(res => {
      if (res.data) {
        setTurns(res.data.currentTurns);
        window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: true } }));
      } else {
        window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: false } }));
        window.dispatchEvent(new CustomEvent('api:error', {
          detail: { message: res.error?.message ?? 'Network error', code: res.error?.code ?? 'UNKNOWN' }
        }));
      }
    }));

    if (needs.includes('hp') && hpStateRef.current.currentHp < hpStateRef.current.maxHp) {
      fetches.push(getHpState().then(res => {
        if (res.data) { setHpState(res.data); hpStateRef.current = res.data; }
      }));
    }

    if (needs.includes('resources')) {
      const staminaFull = staminaStateRef.current.current >= staminaStateRef.current.max;
      const manaFull = manaStateRef.current.current >= manaStateRef.current.max;
      if (!staminaFull || !manaFull) {
        fetches.push(getResources().then(res => {
          if (res.data) { setStaminaState(res.data.stamina); setManaState(res.data.mana); }
        }));
      }
    }

    await Promise.all(fetches);
  }, []); // stable — no deps that change

  const refreshCraftingRecipes = useCallback(async () => {
    const res = await getCraftingRecipes();
    if (res.data) {
      setCraftingRecipes(res.data.recipes);
      setZoneCraftingLevel(res.data.zoneCraftingLevel);
      setZoneCraftingName(res.data.zoneName);
    }
  }, []);

  const loadPvpNotificationCount = useCallback(async () => {
    const result = await getPvpNotificationCount();
    if (result.data) {
      setPvpNotificationCount(result.data.count);
    } else {
      window.dispatchEvent(new CustomEvent('api:error', {
        detail: { message: result.error?.message ?? 'Network error', code: result.error?.code ?? 'UNKNOWN' }
      }));
    }
  }, []);

  const loadFriendCounts = useCallback(async () => {
    const [reqRes, mailRes] = await Promise.all([
      getIncomingFriendRequests(),
      getFriendMailUnreadCount(),
    ]);
    if (reqRes.data) setIncomingFriendRequestCount(reqRes.data.requests.length);
    if (mailRes.data) setMailUnreadCount(mailRes.data.count);
    // Dispatch error if both failed (if only one failed, partial success is OK)
    if (!reqRes.data && !mailRes.data) {
      window.dispatchEvent(new CustomEvent('api:error', {
        detail: { message: 'Network error', code: 'NETWORK_ERROR' }
      }));
    }
  }, []);

  const handleLoadSkillPoints = useCallback(async () => {
    const res = await getSkillPointState();
    if (res.data) setSkillPointState(res.data);
  }, []);

  const handleAllocateSkillPoint = useCallback(async (nodeId: string) => {
    const res = await allocateSkillPoint(nodeId);
    if (res.data) {
      setSkillPointState(res.data);
      if (tutorialStep === TUTORIAL_STEP_SKILL_POINTS && res.data.availablePoints === 0) {
        const nextRes = await updateTutorialStep(TUTORIAL_STEP_SKILL_POINTS + 1);
        if (nextRes.data) setTutorialStep(nextRes.data.tutorialStep);
      }
    }
  }, [tutorialStep]);

  const handleRespecSkillPoints = useCallback(async () => {
    const res = await respecSkillPoints();
    if (res.data) setSkillPointState(res.data);
  }, []);

  const handleLoadTemplates = useCallback(async () => {
    const res = await getTemplates();
    if (res.data) setTemplates(res.data.templates);
  }, []);

  const applyZonesData = useCallback((data: { zones: typeof zones; connections: typeof zoneConnections; undiscoveredZones?: typeof undiscoveredZones; currentZoneId: string }) => {
    setZones(data.zones);
    setZoneConnections(data.connections);
    setUndiscoveredZones(data.undiscoveredZones ?? []);
    setActiveZoneIdImmediate(data.currentZoneId);
    if (data.currentZoneId) {
      getZoneEvents(data.currentZoneId).then((res) => {
        if (res.data) setActiveEvents(res.data.events);
      });
    }
  }, [setActiveZoneIdImmediate]);

  const reloadZones = useCallback(async (options?: { expectedActiveZoneId?: string | null }) => {
    const zonesRes = await getZones({ fresh: true });
    if (!zonesRes.data) return;
    if (
      options
      && 'expectedActiveZoneId' in options
      && activeZoneIdRef.current !== options.expectedActiveZoneId
    ) {
      return;
    }
    applyZonesData(zonesRes.data);
  }, [applyZonesData]);

  const loadAll = useCallback(async () => {
    setActionError(null);

    const [turnRes, playerRes, skillsRes, zonesRes, invRes, equipRes, hpRes, resourceRes, skillPointRes, buffsRes] = await Promise.all([
      getTurns(),
      getPlayer(),
      getSkills(),
      getZones(),
      getInventory(),
      getEquipment(),
      getHpState(),
      getResources(),
      getSkillPointState(),
      getPlayerBuffs(),
    ]);

    if (turnRes.data) setTurns(turnRes.data.currentTurns);
    if (playerRes.data) {
      setCharacterProgression({
        characterXp: playerRes.data.player.characterXp,
        characterLevel: playerRes.data.player.characterLevel,
        attributePoints: playerRes.data.player.attributePoints,
        attributes: playerRes.data.player.attributes,
      });
      setGold(playerRes.data.player.gold ?? 0);
      setActiveEncounterSiteId(playerRes.data.player.activeEncounterSiteId ?? null);
      playerCreatedAtRef.current = playerRes.data.player.createdAt;
      initSettingsFromServer(playerRes.data.player);
      const serverTutorialStep = playerRes.data.player.tutorialStep ?? TUTORIAL_COMPLETED;
      setTutorialStep(serverTutorialStep);
      // Don't show changelog to brand new players (step 0)
      const latestVer = getLatestVersion();
      if (latestVer && localStorage.getItem(CHANGELOG_STORAGE_KEY) !== latestVer) {
        if (serverTutorialStep === 0) {
          localStorage.setItem(CHANGELOG_STORAGE_KEY, latestVer);
        } else {
          setShowChangelog(true);
        }
      }
    }
    if (skillsRes.data) setSkills(skillsRes.data.skills);
    if (hpRes.data) {
      setHpState(hpRes.data);
      hpStateRef.current = hpRes.data;
    }
    if (resourceRes.data) {
      setStaminaState(resourceRes.data.stamina);
      setManaState(resourceRes.data.mana);
    }
    if (skillPointRes.data) setSkillPointState(skillPointRes.data);
    if (buffsRes.data) setActiveBuffs(buffsRes.data.buffs);

    // Load expedition state for activity lock (non-blocking)
    getExpeditionCooldowns().then((cdRes) => {
      if (cdRes.data) setHasActiveExpedition(cdRes.data.hasActiveExpedition);
    });

    if (zonesRes.data) applyZonesData(zonesRes.data);
    if (invRes.data) {
      setInventory(invRes.data.items);
      setInventoryCapacity(invRes.data.capacity ?? 24);
      setInventoryUsedSlots(invRes.data.usedSlots ?? 0);
      if (invRes.data.materialTotals) setMaterialTotals(invRes.data.materialTotals);
      // Detect new notable items for loot reveal
      if (hasLoadedOnceRef.current && lootRevealRarityRef.current !== 'none') {
        const minRank = RARITY_RANK[lootRevealRarityRef.current] ?? 1;
        const newNotableItems = invRes.data.items.filter(
          item => !prevInventoryIdsRef.current.has(item.id) && RARITY_RANK[item.rarity] >= minRank
        );
        if (newNotableItems.length > 0) {
          setLootRevealItems(newNotableItems.map(i => ({
            name: i.template.name,
            rarity: i.rarity as 'uncommon' | 'rare' | 'epic' | 'legendary',
            quantity: i.quantity,
            imageSrc: itemImageSrc(i.template.name, i.template.itemType),
          })));
        }
      }
      prevInventoryIdsRef.current = new Set(invRes.data.items.map(i => i.id));
      hasLoadedOnceRef.current = true;
    }
    if (equipRes.data) {
      setEquipment(
        equipRes.data.equipment.map((e) => ({
          slot: e.slot,
          itemId: e.itemId,
          item: e.item
            ? {
                id: e.item.id,
                rarity: e.item.rarity,
                currentDurability: e.item.currentDurability,
                maxDurability: e.item.maxDurability,
                bonusStats: e.item.bonusStats ?? null,
                template: e.item.template,
              }
            : null,
        }))
      );
    }
    void refreshCraftingRecipes();

    // Fetch guild tax rate (non-blocking — don't delay initial load)
    getPlayerGuild().then((guildRes) => {
      if (guildRes.data?.guild) setGuildTaxRate(guildRes.data.guild.taxRate);
      else setGuildTaxRate(0);
    }).catch(() => setGuildTaxRate(0));
  }, []);

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

  const advanceTutorial = useCallback(async (fromStep: number) => {
    if (tutorialStep !== fromStep) return;
    const nextStep = fromStep + 1;
    const res = await updateTutorialStep(nextStep);
    if (res.data) {
      setTutorialStep(res.data.tutorialStep);
      if (res.data.tutorialStep === TUTORIAL_COMPLETED) {
        trackEvent('tutorial_complete');
      }
    }
  }, [tutorialStep]);

  const skipTutorial = useCallback(async () => {
    const res = await updateTutorialStep(TUTORIAL_SKIPPED);
    if (res.data) setTutorialStep(res.data.tutorialStep);
  }, []);

  const handleTemplateSaved = useCallback(async (templateId?: string) => {
    if (templateId) {
      await activateTemplate(templateId);
      await handleLoadTemplates();
    }
    if (tutorialStep === TUTORIAL_STEP_SAVE_TEMPLATE) {
      void advanceTutorial(TUTORIAL_STEP_SAVE_TEMPLATE);
    }
  }, [tutorialStep, advanceTutorial, handleLoadTemplates]);

  const handleClaimStarterWeapon = useCallback(async (weaponType: 'melee' | 'ranged' | 'magic') => {
    const res = await claimStarterWeapon(weaponType);
    if (res.data?.success) {
      setStarterWeaponType(weaponType);
      await loadAll();
      await advanceTutorial(TUTORIAL_STEP_STARTER_WEAPON);
    }
  }, [advanceTutorial, loadAll]);

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

  // Default tabs during tutorial steps so the player sees the right content
  useEffect(() => {
    if (tutorialStep === TUTORIAL_STEP_GATHER) {
      setActiveGatheringSkill('woodcutting');
    } else if (tutorialStep === TUTORIAL_STEP_REFINE) {
      setActiveCraftingSkill('refining');
    } else if (tutorialStep === TUTORIAL_STEP_CRAFT) {
      setActiveCraftingSkill('weaponsmithing');
    }
  }, [tutorialStep]);

  // Initial one-shot loads
  useEffect(() => {
    if (!isAuthenticated) return;
    void loadAll();
    void loadPvpNotificationCount();
    void loadFriendCounts();
  }, [isAuthenticated, loadAll, loadPvpNotificationCount, loadFriendCounts]);

  // Recurring polls — paused when the tab is hidden to save compute
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
    if (['home', 'skills', 'zones', 'bestiary', 'rest', 'worldEvents', 'achievements', 'quests', 'leaderboard', 'casino', 'training', 'admin'].includes(activeScreen)) return 'home';
    if (['explore', 'gathering', 'crafting', 'forge'].includes(activeScreen)) return 'explore';
    if (['inventory', 'equipment'].includes(activeScreen)) return 'inventory';
    if (['combat', 'arena', 'templates', 'talentTree'].includes(activeScreen)) return 'combat';
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

  const handleNavigate = (screen: string) => {
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
    // Map bottom nav tab ids to default sub-screens
    const resolved = screen === 'social' ? 'guild' : screen;
    setActiveScreen(resolved as Screen);
    trackEvent('screen_view', { screen: resolved });
  };

  const handleMine = async (playerNodeId: string, turnSpend: number) => {
    if (!activeZoneId) return;

    await runAction('gathering', async () => {
      const res = await mine(playerNodeId, turnSpend);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Gathering failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      updateQuestProgress(data.questProgress);
      recordTurnsSpent(activeZoneId, turnSpend);

      const newLogs: ActivityLogEntry[] = [];
      const gatheredSkillName = data.xp?.skillType
        ? data.xp.skillType.charAt(0).toUpperCase() + data.xp.skillType.slice(1)
        : 'Gathering';

      if (data.xp?.leveledUp) {
        newLogs.push({
          timestamp: nowStamp(),
          type: 'success',
          message: `${gatheredSkillName} leveled up to ${data.xp.newLevel}!`,
        });
      }

      logActiveEvents(data.activeEvents);

      if (data.yieldBreakdown?.eventTitle && data.yieldBreakdown.eventModifier !== 1) {
        const isUp = data.yieldBreakdown.eventModifier > 1;
        if (isUp) {
          const bonusPct = Math.round((data.yieldBreakdown.eventModifier - 1) * 100);
          const rawTotal = data.yieldBreakdown.rawTotalYield;
          const yieldDiff = rawTotal != null ? data.results.totalYield - rawTotal : null;
          newLogs.push({
            timestamp: nowStamp(),
            type: 'success',
            message: `${data.yieldBreakdown.eventTitle}: +${bonusPct}% yield bonus${yieldDiff != null ? ` (+${yieldDiff} items)` : ''}`,
          });
        } else {
          const turnPenaltyPct = Math.round((1 / data.yieldBreakdown.eventModifier - 1) * 100);
          newLogs.push({
            timestamp: nowStamp(),
            type: 'warning',
            message: `${data.yieldBreakdown.eventTitle}: +${turnPenaltyPct}% turn cost`,
          });
        }
      }

      if (data.gemCrit) {
        const qty = data.gemCrit.gemsFound;
        newLogs.push({
          timestamp: nowStamp(),
          type: 'success',
          message: qty === 1
            ? `Gem crit! Found a ${data.gemCrit.gemName}!`
            : `Gem crits! Found ${qty}x ${data.gemCrit.gemName}!`,
        });
      }

      if (data.node.nodeDepleted) {
        newLogs.push({
          timestamp: nowStamp(),
          type: 'info',
          message: `Node depleted! Gathered ${data.results.totalYield} resource(s).`,
        });
      } else {
        newLogs.push({
          timestamp: nowStamp(),
          type: 'success',
          message: `Gathered ${data.results.totalYield} resource(s). ${data.node.remainingCapacity} remaining.`,
        });
      }

      pushLog(...newLogs);
      applyStateUpdates(data.stateUpdates, stateSetters);
      const gatherType = data.xp?.skillType ?? 'mining';
      trackEvent('action', { type: gatherType, turns: turnSpend, zone: activeZoneId ?? undefined });
      if (data.xp?.leveledUp) {
        trackEvent('level_up', { skill: data.xp.skillType, level: data.xp.newLevel });
      }
      await loadGatheringNodes();
      advanceTutorial(TUTORIAL_STEP_GATHER);
    });
  };

  const handleCraft = async (recipeId: string, quantity: number = 1) => {
    await runAction('crafting', async () => {
      const recipe = craftingRecipes.find((entry) => entry.id === recipeId);
      const res = await craft(recipeId, quantity);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Crafting failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      updateQuestProgress(data.questProgress);

      const newLogs: ActivityLogEntry[] = [];
      const timestamp = nowStamp();
      const skillName = data.xp.skillType.charAt(0).toUpperCase() + data.xp.skillType.slice(1);

      if (recipe) {
        const materialsUsed = recipe.materials
          .map((material) => {
            const meta = recipe.materialTemplates.find((template) => template.id === material.templateId);
            const consumed = material.quantity * data.crafted.quantity;
            return `${meta?.name ?? 'Unknown'} x${consumed}`;
          })
          .join(', ');

        newLogs.push({
          timestamp,
          type: 'info',
          message: `Used materials: ${materialsUsed}.`,
        });
      }

      newLogs.push({
        timestamp,
        type: 'success',
        message: `Crafted ${recipe?.resultTemplate.name ?? 'item'} x${data.crafted.quantity}.`,
      });

      for (const detail of data.craftedItemDetails ?? []) {
        if (!detail.isCrit || !detail.bonusStats) continue;
        const rarityLabel = detail.rarity !== 'uncommon' ? ` ${detail.rarity}` : '';
        for (const [stat, value] of Object.entries(detail.bonusStats)) {
          newLogs.push({
            timestamp,
            type: 'success',
            message: `Critical${rarityLabel} craft! +${formatStatValue(stat, value)} ${prettyStatName(stat)}.`,
          });
        }
      }

      newLogs.push({
        timestamp,
        type: 'success',
        message: `Gained ${data.xp.xpAfterEfficiency.toLocaleString()} ${skillName} XP.`,
      });

      if (data.xp?.leveledUp) {
        newLogs.push({
          timestamp,
          type: 'success',
          message: `${skillName} leveled up to ${data.xp.newLevel}!`,
        });
      }

      if (data.xp?.atDailyCap) {
        newLogs.push({
          timestamp,
          type: 'info',
          message: `${skillName} has reached the daily XP cap.`,
        });
      }

      pushLog(...newLogs);
      applyStateUpdates(data.stateUpdates, stateSetters);
      const craftTurns = recipe ? recipe.turnCost * quantity : 50;
      trackEvent('action', { type: data.xp.skillType, turns: craftTurns });
      trackOnce('first_craft', { skill: data.xp.skillType });
      if (data.xp?.leveledUp) {
        trackEvent('level_up', { skill: data.xp.skillType, level: data.xp.newLevel });
      }
      advanceTutorial(TUTORIAL_STEP_REFINE);
      advanceTutorial(TUTORIAL_STEP_CRAFT);
    });
  };

  const handleAllocateAttribute = async (attribute: AttributeType, points = 1) => {
    await runAction('allocate_attribute', async () => {
      const res = await allocatePlayerAttribute(attribute, points);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Failed to allocate attribute points');
        return;
      }

      setCharacterProgression(res.data);

      const hpRes = await getHpState();
      if (hpRes.data) setHpState(hpRes.data);

      if (tutorialStep === TUTORIAL_STEP_ATTRIBUTE_POINTS && res.data.attributePoints === 0) {
        advanceTutorial(TUTORIAL_STEP_ATTRIBUTE_POINTS);
      }
    });
  };

  const handleQuickRest = async () => {
    if (!hpState || hpState.currentHp >= hpState.maxHp || hpState.isRecovering || turns <= 0) return;

    await runAction('quick_rest', async () => {
      const estimate = await restEstimate(10);
      if (!estimate.data?.healPerTurn) return;
      const missingHp = hpState.maxHp - hpState.currentHp;
      const targetHeal = missingHp * (quickRestHealPercent / 100);
      const rawTurns = Math.ceil(targetHeal / estimate.data.healPerTurn);
      const turnsToSpend = Math.max(10, Math.ceil(rawTurns / 10) * 10);
      const actualTurns = Math.min(turnsToSpend, turns);
      const result = await rest(actualTurns);
      if (result.data) {
        const healed = result.data.currentHp - hpState.currentHp;
        setTurns(result.data.turns.currentTurns);
        setHpState(prev => ({ ...prev, currentHp: result.data!.currentHp, maxHp: result.data!.maxHp }));
        applyStateUpdates(result.data.stateUpdates, stateSetters);
        pushLog({ timestamp: nowStamp(), type: 'success', message: `Rested ${actualTurns.toLocaleString()} turns, healed ${Math.round(healed)} HP` });
        trackEvent('action', { type: 'rest', turns: actualTurns });
      }
    });
  };

  const dismissChangelog = useCallback(() => {
    localStorage.setItem(CHANGELOG_STORAGE_KEY, getLatestVersion());
    setShowChangelog(false);
  }, []);

  const openChangelog = useCallback(() => setShowChangelog(true), []);

  const handleExchangeGold = useCallback(async (turnAmount: number) => {
    const result = await exchangeGold(turnAmount);
    if (result.data) {
      setGold(result.data.goldBalance);
      setTurns(result.data.turnsRemaining);
    }
  }, []);

  const handlePlaceBet = useCallback(async (betType: RouletteBetType, betValue: string, amount: number) => {
    const result = await placeRouletteBet(betType, betValue, amount);
    if (result.data) {
      setGold(result.data.goldRemaining);
    }
  }, []);

  const handleDismissLootReveal = useCallback(() => {
    setLootRevealItems(null);
  }, []);

  return {
    // Navigation
    activeScreen,
    setActiveScreen,
    handleNavigate,
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
    handleMine,
    handleCraft,
    ...inventoryActions,
    handleAllocateAttribute,
    loadAll,
    loadPvpNotificationCount,
    handleSetCombatLogSpeed,
    handleSetExplorationSpeed,
    handleSetAutoSkipKnownCombat,
    handleSetDefaultExploreTurns,
    handleSetQuickRestHealPercent,
    handleSetDefaultRefiningMax,
    handleQuickRest,

    // Inventory & backpack
    inventoryCapacity,
    inventoryUsedSlots,
    isOverEncumbered: inventoryUsedSlots > inventoryCapacity,
    backpackFull: inventoryUsedSlots >= inventoryCapacity,
    pendingLootSession: loot.pendingLootSession,
    handleClaimLoot: loot.handleClaimLoot,
    handleDismissLoot: loot.handleDismissLoot,
    handleReopenLoot: loot.handleReopenLoot,

    // State update helpers
    stateSetters,

    // Casino & Training
    handleExchangeGold,
    handlePlaceBet,

    // Loot reveal
    lootRevealItems,
    handleDismissLootReveal,

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
