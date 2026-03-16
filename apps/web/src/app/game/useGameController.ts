import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { itemImageSrc } from '@/lib/assets';
import { getLatestVersion, CHANGELOG_STORAGE_KEY } from '@/lib/changelog';
import { RARITY_RANK } from '@/lib/rarity';
import { useCombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';
import { updateTutorialStep } from '@/lib/api';
import {
  TUTORIAL_STEP_WELCOME,
  TUTORIAL_STEP_EXPLORE,
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
  destroyInventoryItem,
  equip,
  forgeReroll,
  forgeUpgrade,
  getBestiary,
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
  repairItem,
  repairAllEquipped,
  rest,
  restEstimate,
  salvage,
  salvageBatch,
  selectSiteStrategy,
  useItem,
  startCombatFromEncounterSite,
  startExploration,
  travelToZone,
  unequip,
  sellItem,
  sellBulk,
  depositToStash,
  depositBatchToStash,
  withdrawBatchFromStash,
  withdrawFromStash,
  claimLoot,
  fetchPendingLoot,
  getResources,
  getSkillPointState,
  allocateSkillPoint,
  respecSkillPoints,
  getTemplates,
  type ApiResponse,
  type PendingLootItem,
  type WorldEventResponse,
  type SkillPointState,
  exchangeGold,
  placeRouletteBet,
  getIncomingFriendRequests,
  getFriendMailUnreadCount,
  getPlayerBuffs,
} from '@/lib/api';
import type { PlayerBuffData, StateUpdates } from '@pocketrealm/shared';
import type { CombatTemplateData, QuestProgressUpdate, ResourceState } from '@pocketrealm/shared';
import type { RouletteBetType } from '@pocketrealm/shared';
import { STAMINA_CONSTANTS, MANA_CONSTANTS } from '@pocketrealm/shared';
import { applyStateUpdates, type StateSetters } from './applyStateUpdates';
import { prettyStatName, formatStatValue } from '@/lib/statFormat';
import { fmtDur } from '@/lib/format';
import { findShortestZonePath } from '@/lib/zoneRoutes';
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

type AttributeType = keyof CharacterProgression['attributes'];

function mapPlaybackEventsToLogs(
  events: Array<{ turn: number; type: string; description: string }>,
): Array<{ timestamp: string; type: 'info' | 'success' | 'danger'; message: string }> {
  return events.slice().reverse().map((event) => ({
    timestamp: nowStamp(),
    type: (event.type === 'ambush_defeat'
      ? 'danger'
      : event.type === 'ambush_victory' || event.type === 'encounter_site' || event.type === 'resource_node'
        ? 'success'
        : 'info') as 'info' | 'success' | 'danger',
    message: `Turn ${event.turn}: ${event.description}`,
  }));
}

function showQuestToasts(updates?: QuestProgressUpdate[]) {
  if (!updates?.length) return;
  const show = (window as unknown as Record<string, unknown>).__showQuestToast as
    | ((update: QuestProgressUpdate) => void)
    | undefined;
  if (!show) return;
  for (const update of updates) show(update);
}

interface TravelRouteState {
  remainingZoneIds: string[];
  totalHops: number;
  finalDestinationName: string;
}

interface TravelPlaybackState {
  totalTurns: number;
  destinationName: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBefore: number;
  playerMaxHp: number;
  respawnedToName?: string;
  currentHop: number;
  totalHops: number;
  finalDestinationName: string;
  stateUpdates?: StateUpdates;
}

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
  const [skills, setSkills] = useState<Array<{ skillType: string; level: number; xp: number; dailyXpGained: number }>>([]);
  const [characterProgression, setCharacterProgression] = useState<CharacterProgression>(DEFAULT_CHARACTER_PROGRESSION);
  const [inventory, setInventory] = useState<Array<{
    id: string;
    quantity: number;
    rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
    currentDurability: number | null;
    maxDurability: number | null;
    bonusStats: Record<string, number> | null;
    equippedSlot: string | null;
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
      sellPrice?: number | null;
    };
  }>>([]);
  const [inventoryCapacity, setInventoryCapacity] = useState(24);
  const [inventoryUsedSlots, setInventoryUsedSlots] = useState(0);
  const [materialTotals, setMaterialTotals] = useState<Record<string, number>>({});
  const [pendingLootSession, setPendingLootSession] = useState<{
    sessionId: string;
    items: PendingLootItem[];
    minimized?: boolean;
  } | null>(null);
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
  const gathering = useGathering(isAuthenticated, activeScreen);
  const { loadGatheringNodes, setActiveGatheringSkill } = gathering;
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
  const encounterSites = useEncounterSites(isAuthenticated, activeScreen);
  const { refreshPendingEncounters, pendingEncounters } = encounterSites;
  const [lastCombat, setLastCombat] = useState<LastCombat | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { bestiaryMobs, bestiaryLoading, bestiaryError, bestiaryPrefixSummary, expeditionThemes, worldBosses, loadBestiary } = useBestiary(isAuthenticated, activeScreen);
  const [hpState, setHpState] = useState<HpState>({ currentHp: 100, maxHp: 100, regenPerSecond: 0.4, isRecovering: false, recoveryCost: null });
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
  const combatLogPrefetch = useCombatLogPrefetch();
  const [playbackActive, setPlaybackActive] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const activatePendingLootRef = useRef<(sessionId: string) => Promise<void>>(async () => {});
  const pendingLootQueueRef = useRef<string[]>([]);
  const arrivedInTownRef = useRef(false);
  const travelRouteRef = useRef<TravelRouteState | null>(null);
  const lastEventLogTimeRef = useRef(0);
  const prevInventoryIdsRef = useRef<Set<string>>(new Set());
  const hasLoadedOnceRef = useRef(false);
  const lootRevealRarityRef = useRef(lootRevealRarity);
  lootRevealRarityRef.current = lootRevealRarity;
  const [lootRevealItems, setLootRevealItems] = useState<Array<{
    name: string;
    rarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
    quantity: number;
    imageSrc?: string;
  }> | null>(null);
  const [explorationPlaybackData, setExplorationPlaybackData] = useState<{
    totalTurns: number;
    zoneName: string;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    aborted: boolean;
    refundedTurns: number;
    playerHpBeforeExploration: number;
    playerMaxHp: number;
    pendingLootSessionIds?: string[];
    stateUpdates?: StateUpdates;
  } | null>(null);
  const [travelPlaybackData, setTravelPlaybackData] = useState<TravelPlaybackState | null>(null);
  const hpStateRef = useRef(hpState);
  useEffect(() => {
    hpStateRef.current = hpState;
  }, [hpState]);
  const staminaStateRef = useRef(staminaState);
  useEffect(() => {
    staminaStateRef.current = staminaState;
  }, [staminaState]);
  const manaStateRef = useRef(manaState);
  useEffect(() => {
    manaStateRef.current = manaState;
  }, [manaState]);

  const stateSetters: StateSetters = {
    setInventory: (updater) => setInventory(updater as any),
    setInventoryCapacity,
    setInventoryUsedSlots,
    setEquipment: (eq) => setEquipment(eq as any),
    setSkills: (skills) => { if (skills) setSkills(skills as any); },
    setHpState: (hp) => { setHpState(hp); hpStateRef.current = hp; },
    setStaminaState: (s) => setStaminaState(s as any),
    setManaState: (m) => setManaState(m as any),
    setGold,
    setActiveBuffs: (buffs) => { setActiveBuffs(buffs as any); },
    setCharacterProgression: (cp) => setCharacterProgression(cp as any),
  };

  const loadTurnsAndHp = useCallback(async () => {
    const [turnRes, hpRes, resourceRes] = await Promise.all([getTurns(), getHpState(), getResources()]);
    if (turnRes.data) setTurns(turnRes.data.currentTurns);
    if (hpRes.data) {
      setHpState(hpRes.data);
      hpStateRef.current = hpRes.data;
    }
    if (resourceRes.data) {
      setStaminaState(resourceRes.data.stamina);
      setManaState(resourceRes.data.mana);
    }
  }, []);

  const pollScreenData = useCallback(async () => {
    const needs = SCREEN_POLL_NEEDS[activeScreen] ?? ['turns'];
    const fetches: Promise<void>[] = [];

    fetches.push(getTurns().then(res => { if (res.data) setTurns(res.data.currentTurns); }));

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
  }, [activeScreen]);

  const loadPvpNotificationCount = useCallback(async () => {
    const result = await getPvpNotificationCount();
    if (result.data) {
      setPvpNotificationCount(result.data.count);
    }
  }, []);

  const loadFriendCounts = useCallback(async () => {
    const [reqRes, mailRes] = await Promise.all([
      getIncomingFriendRequests(),
      getFriendMailUnreadCount(),
    ]);
    if (reqRes.data) setIncomingFriendRequestCount(reqRes.data.requests.length);
    if (mailRes.data) setMailUnreadCount(mailRes.data.count);
  }, []);

  const handleLoadSkillPoints = useCallback(async () => {
    const res = await getSkillPointState();
    if (res.data) setSkillPointState(res.data);
  }, []);

  const handleAllocateSkillPoint = useCallback(async (nodeId: string) => {
    const res = await allocateSkillPoint(nodeId);
    if (res.data) setSkillPointState(res.data);
  }, []);

  const handleRespecSkillPoints = useCallback(async () => {
    const res = await respecSkillPoints();
    if (res.data) setSkillPointState(res.data);
  }, []);

  const handleLoadTemplates = useCallback(async () => {
    const res = await getTemplates();
    if (res.data) setTemplates(res.data.templates);
  }, []);

  const loadAll = useCallback(async () => {
    setActionError(null);

    const [turnRes, playerRes, skillsRes, zonesRes, invRes, equipRes, recipesRes, hpRes, resourceRes, skillPointRes, buffsRes] = await Promise.all([
      getTurns(),
      getPlayer(),
      getSkills(),
      getZones(),
      getInventory(),
      getEquipment(),
      getCraftingRecipes(),
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
    if (zonesRes.data) {
      setZones(zonesRes.data.zones);
      setZoneConnections(zonesRes.data.connections);
      setUndiscoveredZones(zonesRes.data.undiscoveredZones ?? []);
      setActiveZoneId(zonesRes.data.currentZoneId);
      if (zonesRes.data.currentZoneId) {
        getZoneEvents(zonesRes.data.currentZoneId).then((res) => {
          if (res.data) setActiveEvents(res.data.events);
        });
      }
    }
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
    if (recipesRes.data) {
      setCraftingRecipes(recipesRes.data.recipes);
      setZoneCraftingLevel(recipesRes.data.zoneCraftingLevel);
      setZoneCraftingName(recipesRes.data.zoneName);
    }

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
  } = useQuests();

  const advanceTutorial = useCallback(async (fromStep: number) => {
    if (tutorialStep !== fromStep) return;
    const nextStep = fromStep + 1;
    const res = await updateTutorialStep(nextStep);
    if (res.data) setTutorialStep(res.data.tutorialStep);
  }, [tutorialStep]);

  const skipTutorial = useCallback(async () => {
    const res = await updateTutorialStep(TUTORIAL_SKIPPED);
    if (res.data) setTutorialStep(res.data.tutorialStep);
  }, []);

  const combatPlayback = useCombatPlayback({
    combatLogPrefetch,
    setLastCombat,
    setPlaybackActive,
    refreshPendingEncounters,
    advanceTutorial,
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

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    // Initial loads are one-shot and safe to complete after cleanup —
    // only guard recurring intervals to prevent stale polling.
    void loadAll();
    void loadPvpNotificationCount();
    void loadFriendCounts();
    const interval = setInterval(() => { if (!cancelled) void pollScreenData(); }, 10000);
    // Poll PvP notifications less frequently (60s)
    const pvpInterval = setInterval(() => { if (!cancelled) void loadPvpNotificationCount(); }, 60000);
    // Poll friend counts at same cadence as PvP
    const friendInterval = setInterval(() => { if (!cancelled) void loadFriendCounts(); }, 60000);
    return () => { cancelled = true; clearInterval(interval); clearInterval(pvpInterval); clearInterval(friendInterval); };
  }, [isAuthenticated, loadAll, pollScreenData, loadPvpNotificationCount, loadFriendCounts]);

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

  const logDurabilityWarnings = (
    losses: Array<{
      itemName?: string;
      newDurability?: number;
      maxDurability?: number;
      isBroken?: boolean;
      crossedWarningThreshold?: boolean;
    }>,
  ) => {
    const entries: ActivityLogEntry[] = [];
    for (const loss of losses) {
      if (!loss.itemName) continue;
      if (loss.isBroken) {
        entries.push({
          timestamp: nowStamp(),
          type: 'danger',
          message: `Your ${loss.itemName} has broken!`,
        });
      } else if (loss.crossedWarningThreshold) {
        entries.push({
          timestamp: nowStamp(),
          type: 'warning',
          message: `Your ${loss.itemName} is about to break! (${fmtDur(loss.newDurability!)}/${loss.maxDurability})`,
        });
      }
    }
    if (entries.length > 0) pushLog(...entries);
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

  const runAction = async (actionName: string, fn: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(actionName);
    setActionError(null);
    try {
      await fn();
    } finally {
      setBusyAction(null);
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

  const handleStartExploration = async (turnSpend: number, tier?: number) => {
    if (!currentZone) return;

    await runAction('exploration', async () => {
      const hpBefore = hpState.currentHp;
      const maxHpBefore = hpState.maxHp;
      const res = await startExploration(currentZone.id, turnSpend, tier);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Exploration failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      showQuestToasts(data.questProgress);

      // Always trigger animated playback — even empty results get a brief progress bar
      setExplorationPlaybackData({
        totalTurns: turnSpend,
        zoneName: data.zone.name,
        events: data.events,
        aborted: data.aborted,
        refundedTurns: data.refundedTurns,
        playerHpBeforeExploration: hpBefore,
        playerMaxHp: maxHpBefore,
        pendingLootSessionIds: data.pendingLootSessionIds,
        stateUpdates: (data as any).stateUpdates,
      });
      setPlaybackActive(true);

      // Refresh encounter sites and gathering nodes discovered during exploration.
      // Don't call loadAll() here — defer until playback completes so the zone
      // doesn't update to the respawn town mid-playback.
      if (data.encounterSites.length > 0) {
        await refreshPendingEncounters();
      }
      if (data.resourceDiscoveries.length > 0) {
        await loadGatheringNodes();
      }
    });
  };

  const handleExplorationPlaybackComplete = async () => {
    if (explorationPlaybackData) {
      pushLog({
        timestamp: nowStamp(),
        type: 'info',
        message: `Explored ${explorationPlaybackData.totalTurns.toLocaleString()} turns in ${explorationPlaybackData.zoneName}.`,
      });
      if (explorationPlaybackData.aborted && explorationPlaybackData.refundedTurns > 0) {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Exploration aborted. ${explorationPlaybackData.refundedTurns.toLocaleString()} turns refunded.`,
        });
      }
      for (const event of explorationPlaybackData.events) {
        const losses = event.details?.durabilityLost;
        if (Array.isArray(losses)) logDurabilityWarnings(losses);
      }
    }
    await finalizeExplorationPlayback();
  };

  const finalizeExplorationPlayback = async () => {
    const pendingIds = explorationPlaybackData?.pendingLootSessionIds;
    const savedStateUpdates = explorationPlaybackData?.stateUpdates;
    setExplorationPlaybackData(null);
    combatLogPrefetch.clear();
    setPlaybackActive(false);
    await advanceTutorial(TUTORIAL_STEP_EXPLORE);
    applyStateUpdates(savedStateUpdates, stateSetters);
    if (pendingIds?.length) {
      pendingLootQueueRef.current = pendingIds.slice(1);
      await activatePendingLoot(pendingIds[0]);
    }
  };

  const handlePlaybackSkip = async () => {
    if (explorationPlaybackData) {
      pushLog(
        {
          timestamp: nowStamp(),
          type: 'info',
          message: `Explored ${explorationPlaybackData.totalTurns.toLocaleString()} turns in ${explorationPlaybackData.zoneName}.`,
        },
        ...mapPlaybackEventsToLogs(explorationPlaybackData.events),
      );
      if (explorationPlaybackData.aborted && explorationPlaybackData.refundedTurns > 0) {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Exploration aborted. ${explorationPlaybackData.refundedTurns.toLocaleString()} turns refunded.`,
        });
      }
    }
    await finalizeExplorationPlayback();
  };

  const handleStartCombat = async (encounterSiteId: string) => {
    const selectedSite = pendingEncounters.find((site) => site.encounterSiteId === encounterSiteId);
    if (selectedSite && activeZoneId && selectedSite.zoneId !== activeZoneId) {
      setActionError(`Travel to ${selectedSite.zoneName} before fighting this encounter.`);
      return;
    }

    const hpBefore = hpState.currentHp;

    await runAction('combat', async () => {
      const res = await startCombatFromEncounterSite(encounterSiteId, 'melee');
      const data = res.data;
      if (!data) {
        if (res.error?.code === 'SITE_DECAYED' || res.error?.code === 'NOT_FOUND') {
          await refreshPendingEncounters();
        }
        setActionError(res.error?.message ?? 'Combat failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      showQuestToasts(data.questProgress);

      const rewards: LastCombat['rewards'] = {
        xp: data.rewards.xp,
        loot: data.rewards.loot,
        siteCompletion: data.rewards.siteCompletion ?? null,
        skillXpGrants: data.rewards.skillXpGrants ?? [],
      };

      // Build playback queue from fights[] or single-element queue for zone combat
      if (data.combat.fights && data.combat.fights.length > 0) {
        const queue = data.combat.fights.map((fight, idx) => {
          const fightLogId = fight.combatLogId;
          return {
            room: fight.room,
            mobName: fight.mobName ?? data.combat.mobName,
            mobDisplayName: fight.mobDisplayName,
            mobTemplateId: fight.mobTemplateId,
            mobPrefix: fight.mobPrefix,
            outcome: fight.outcome,
            combatantAMaxHp: fight.playerMaxHp,
            playerStartHp: fight.playerStartHp,
            playerStartStamina: fight.playerStartStamina,
            playerStartMana: fight.playerStartMana,
            combatantBMaxHp: fight.mobMaxHp,
            log: fight.log?.length ? (fight.log as LastCombatLogEntry[]) : null,
            combatLogId: fightLogId,
            activeEvents: data.activeEvents,
            rewards: {
              xp: fight.xp,
              loot: fight.loot,
              siteCompletion: null as LastCombat['rewards']['siteCompletion'],
              skillXpGrants: fight.skillXpGrants ?? [],
            } satisfies LastCombat['rewards'],
          };
        });

        // Pre-fetch first two fights' logs
        for (let i = 0; i < Math.min(2, queue.length); i++) {
          if (queue[i].combatLogId) {
            combatLogPrefetch.prefetch(queue[i].combatLogId!);
          }
        }


        pendingCombatRewardsRef.current = rewards;
        setCombatPlaybackQueue(queue);
        setCombatPlaybackIndex(0);
      } else {
        const combatLogId = data.combat.combatLogId;
        setCombatPlaybackQueue([{
          mobName: data.combat.mobName,
          mobDisplayName: data.combat.mobDisplayName,
          mobTemplateId: data.combat.mobTemplateId,
          mobPrefix: data.combat.mobPrefix,
          outcome: data.combat.outcome,
          combatantAMaxHp: data.combat.playerMaxHp,
          playerStartHp: hpBefore,
          playerStartStamina: data.combat.playerStartStamina,
          playerStartMana: data.combat.playerStartMana,
          combatantBMaxHp: data.combat.mobMaxHp,
          log: data.combat.log?.length ? (data.combat.log as LastCombatLogEntry[]) : null,
          combatLogId,
          activeEvents: data.activeEvents,
          rewards,
        }]);
        setCombatPlaybackIndex(0);
        pendingCombatRewardsRef.current = rewards;

        if (combatLogId) combatLogPrefetch.prefetch(combatLogId);
      }
      setPlaybackActive(true);

      if (data.rewards.siteCompletion) {
        siteJustClearedRef.current = true;
      }

      logActiveEvents(data.activeEvents);

      if (data.rewards.siteCompletion) {
        const chest = data.rewards.siteCompletion;
        const chestLabel = `${chest.chestRarity.charAt(0).toUpperCase()}${chest.chestRarity.slice(1)} Chest`;
        const lootCount = chest.loot.reduce((sum, entry) => sum + entry.quantity, 0);
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Encounter site cleared. ${chestLabel} opened with ${lootCount} item${lootCount === 1 ? '' : 's'}.`,
        });

        if (chest.recipeUnlocked) {
          const unlockedRecipe = chest.recipeUnlocked;
          pushLog({
            timestamp: nowStamp(),
            type: 'success',
            message: `Learned advanced recipe: ${unlockedRecipe.recipeName}.`,
          });
        }
      }

      for (const grant of data.rewards?.skillXpGrants ?? []) {
        if (grant.leveledUp) {
          const skillName = grant.skillType.charAt(0).toUpperCase() + grant.skillType.slice(1);
          pushLog({ timestamp: nowStamp(), type: 'success', message: `🎉 ${skillName} leveled up to ${grant.newLevel}!` });
        }
      }

      logDurabilityWarnings(data.rewards.durabilityLost);

      if (data.combat.room?.roomCleared && data.combat.room.siteStrategy === 'room_by_room') {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Room ${data.combat.room.currentRoom} cleared! You can rest before the next room.`,
        });
      }

      // Store pending loot session ID for activation after playback
      combatPendingLootRef.current = data.pendingLootSessionId ?? null;

      applyStateUpdates((data as any).stateUpdates, stateSetters);
      await loadBestiary(false);
    });
  };

  const handleSelectStrategy = useCallback(async (
    encounterSiteId: string,
    strategy: 'full_clear' | 'room_by_room'
  ) => {
    setBusyAction('strategy');
    try {
      await selectSiteStrategy(encounterSiteId, strategy);
      await refreshPendingEncounters();
    } catch (err) {
      pushLog({ timestamp: nowStamp(), type: 'danger', message: `Failed to select strategy: ${(err as Error).message}` });
    } finally {
      setBusyAction(null);
    }
  }, [refreshPendingEncounters]);

  const handleNavigate = (screen: string) => {
    // Auto-skip any active playback when navigating away
    if (playbackActive) {
      if (explorationPlaybackData) {
        void handlePlaybackSkip();
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
      if (travelPlaybackData) {
        void handleTravelPlaybackSkip();
      }
    }
    // Clear last combat log when leaving the combat screen — it's in history if needed
    if (activeScreen === 'combat' && screen !== 'combat') {
      setLastCombat(null);
    }
    // Map bottom nav tab ids to default sub-screens
    const resolved = screen === 'social' ? 'guild' : screen;
    setActiveScreen(resolved as Screen);
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
      showQuestToasts(data.questProgress);

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
      applyStateUpdates((data as any).stateUpdates, stateSetters);
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
      showQuestToasts(data.questProgress);

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
      applyStateUpdates((data as any).stateUpdates, stateSetters);
      advanceTutorial(TUTORIAL_STEP_REFINE);
      advanceTutorial(TUTORIAL_STEP_CRAFT);
    });
  };

  const handleSalvageItem = (itemId: string) =>
    simpleAction('salvage', () => salvage(itemId), (data) => {
      setTurns(data.turns.currentTurns);
      const materialSummary = data.salvage.returnedMaterials.map((e) => `${e.name} x${e.quantity}`).join(', ');
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Salvaged item for: ${materialSummary}.` });
    });

  const handleSalvageBatch = (itemIds: string[]) =>
    simpleAction('salvage_batch', () => salvageBatch(itemIds), (data) => {
      setTurns(data.turns.currentTurns);
      const materialSummary = data.returnedMaterials.map((e) => `${e.name} x${e.quantity}`).join(', ');
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Salvaged ${data.salvaged.length} items (${data.totalTurnCost} turns). Recovered: ${materialSummary}` });
    });

  const handleForgeUpgrade = (itemId: string, sacrificialItemId: string) =>
    simpleAction('forge_upgrade', () => forgeUpgrade(itemId, sacrificialItemId), (data) => {
      setTurns(data.turns.currentTurns);
      const fromLabel = data.forge.fromRarity.charAt(0).toUpperCase() + data.forge.fromRarity.slice(1);
      const toLabel = data.forge.toRarity.charAt(0).toUpperCase() + data.forge.toRarity.slice(1);
      const effectiveChance = data.forge.adjustedChance ?? data.forge.successChance;
      const chancePct = (effectiveChance * 100).toFixed(1);
      const buffTag = data.forge.buffUsed === 'forge_luck' ? ' [Forge Luck active]'
        : data.forge.buffUsed === 'forge_protection' ? ' [Forge Protection active]'
        : '';

      if (data.forge.success) {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Forge success: ${fromLabel} -> ${toLabel} (${chancePct}% chance).${buffTag} Sacrificial item consumed.`,
        });
      } else if (data.forge.protected) {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Forge failed at ${fromLabel} (${chancePct}% chance) but item was protected!${buffTag} Sacrifice consumed.`,
        });
      } else {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Forge failed at ${fromLabel} (${chancePct}% chance).${buffTag} Target and sacrifice consumed.`,
        });
      }
    });

  const handleForgeReroll = (itemId: string, sacrificialItemId: string) =>
    simpleAction('forge_reroll', () => forgeReroll(itemId, sacrificialItemId), (data) => {
      setTurns(data.turns.currentTurns);
      const rarityLabel = data.forge.rarity.charAt(0).toUpperCase() + data.forge.rarity.slice(1);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Re-rolled ${rarityLabel} item bonus stats. Sacrificial duplicate consumed.` });
    });

  const handleDestroyItem = (itemId: string) =>
    simpleAction('destroy', () => destroyInventoryItem(itemId));

  const handleRepairItem = (itemId: string) =>
    simpleAction('repair', () => repairItem(itemId), (data) => {
      if (data.turns) setTurns(data.turns.currentTurns);
      if (data.destroyed) {
        const label = data.name ?? 'Item';
        pushLog({ timestamp: nowStamp(), type: 'warning', message: `${label} was too degraded to survive repair and has been permanently destroyed.` });
      }
    });

  const handleRepairAllEquipped = () =>
    simpleAction('repair_all', () => repairAllEquipped(), (data) => {
      if (data.turns) setTurns(data.turns.currentTurns);
      const destroyed = data.items.filter((i) => i.destroyed);
      for (const item of destroyed) {
        pushLog({ timestamp: nowStamp(), type: 'warning', message: `${item.name} was too degraded to survive repair and has been permanently destroyed.` });
      }
    });

  const handleUseItem = (itemId: string) =>
    simpleAction('use_item', () => useItem(itemId));

  const handleEquipItem = (itemId: string, slot: string) =>
    simpleAction('equip', () => equip(itemId, slot), async () => {
      await advanceTutorial(TUTORIAL_STEP_EQUIP);
    });

  const handleUnequipSlot = (slot: string) =>
    simpleAction('unequip', () => unequip(slot));

  const handleSellItem = (itemId: string) =>
    simpleAction('sell', () => sellItem(itemId), (data) => {
      setGold(data.newGold);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Sold item for ${data.goldEarned} gold` });
    });

  const handleSellBatch = (itemIds: string[]) =>
    simpleAction('sell_batch', () => sellBulk(itemIds), (data) => {
      setGold(data.newGold);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Sold ${data.soldCount} item(s) for ${data.totalGoldEarned} gold` });
    });

  const handleDepositItem = (itemId: string) =>
    simpleAction('deposit', () => depositToStash(itemId), () => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: 'Item deposited to stash' });
    });

  const handleDepositBatch = (itemIds: string[]) =>
    simpleAction('deposit_batch', () => depositBatchToStash(itemIds), (data) => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: `${data.depositedCount} item(s) deposited to stash` });
    });

  const handleWithdrawItem = (itemId: string) =>
    simpleAction('withdraw', () => withdrawFromStash(itemId), () => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: 'Item withdrawn from stash' });
    });

  const handleWithdrawBatch = (itemIds: string[]) =>
    simpleAction('withdraw_batch', () => withdrawBatchFromStash(itemIds), (data) => {
      pushLog({ timestamp: nowStamp(), type: 'success', message: `${data.withdrawnCount} item(s) withdrawn from stash` });
    });

  const activateNextQueuedLoot = async () => {
    const next = pendingLootQueueRef.current.shift();
    if (next) {
      await activatePendingLoot(next);
    }
  };

  const clearExpiredLoot = async () => {
    setPendingLootSession(null);
    pushLog({ timestamp: nowStamp(), type: 'warning', message: 'Overflow loot expired — unclaimed items were lost.' });
    await activateNextQueuedLoot();
  };

  const activatePendingLoot = async (sessionId: string) => {
    const res = await fetchPendingLoot(sessionId);
    if (res.data?.items?.length) {
      setPendingLootSession({ sessionId, items: res.data.items, minimized: false });
      pushLog({
        timestamp: nowStamp(),
        type: 'warning',
        message: `Backpack full! ${res.data.items.length} item(s) waiting to be claimed.`,
      });
    } else {
      clearExpiredLoot();
    }
  };
  activatePendingLootRef.current = activatePendingLoot;

  const handleClaimLoot = async (sessionId: string, selectedIndices: number[]) => {
    await runAction('claim_loot', async () => {
      const res = await claimLoot(sessionId, selectedIndices);
      if (!res.data) {
        if (res.error?.code === 'LOOT_EXPIRED') {
          clearExpiredLoot();
        } else {
          setPendingLootSession(null);
          setActionError(res.error?.message ?? 'Loot claim failed');
        }
        return;
      }
      setPendingLootSession(null);
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Claimed ${selectedIndices.length} loot items`,
      });
      applyStateUpdates((res.data as any).stateUpdates, stateSetters);
      await activateNextQueuedLoot();
    });
  };

  const handleDismissLoot = () => {
    setPendingLootSession((prev) => prev ? { ...prev, minimized: true } : null);
  };

  const handleReopenLoot = async () => {
    const session = pendingLootSession;
    if (!session) return;
    const res = await fetchPendingLoot(session.sessionId);
    if (res.data?.items?.length) {
      setPendingLootSession({ sessionId: session.sessionId, items: res.data.items, minimized: false });
    } else {
      clearExpiredLoot();
    }
  };

  const [confirmAbandonLoot, setConfirmAbandonLoot] = useState<{ travelZoneId: string } | null>(null);

  const completeQueuedTravelRoute = async () => {
    travelRouteRef.current = null;
    setPlaybackActive(false);

    if (arrivedInTownRef.current) {
      arrivedInTownRef.current = false;
      advanceTutorial(TUTORIAL_STEP_TRAVEL);
    }

    if (!pendingLootSession && pendingLootQueueRef.current.length > 0) {
      await activateNextQueuedLoot();
    }
  };

  const executeNextTravelHop = async () => {
    const route = travelRouteRef.current;
    if (!route || route.remainingZoneIds.length === 0) {
      await completeQueuedTravelRoute();
      return;
    }

    const nextZoneId = route.remainingZoneIds[0]!;
    const currentHop = route.totalHops - route.remainingZoneIds.length + 1;
    const hpBefore = hpStateRef.current.currentHp;
    const playerMaxHp = hpStateRef.current.maxHp;

    const res = await travelToZone(nextZoneId);
    const data = res.data;
    if (!data) {
      travelRouteRef.current = null;
      setPlaybackActive(false);
      setActionError(res.error?.message ?? 'Travel failed');
      // Earlier hops may have committed — reload world state and drain queued loot
      await loadAll();
      if (pendingLootQueueRef.current.length > 0) {
        await activateNextQueuedLoot();
      }
      return;
    }

    setTurns(data.turns.currentTurns);
    route.remainingZoneIds.shift();

    const arrivedInTown = data.zone.zoneType === 'town';
    if (arrivedInTown) arrivedInTownRef.current = true;

    if (data.pendingLootSessionId) {
      pendingLootQueueRef.current.push(data.pendingLootSessionId);
    }

    if (data.breadcrumbReturn) {
      setActiveZoneId(data.zone.id);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Returned to ${data.zone.name}.` });

      if (route.remainingZoneIds.length > 0) {
        applyStateUpdates((data as any).stateUpdates, stateSetters);
        await executeNextTravelHop();
        return;
      }

      applyStateUpdates((data as any).stateUpdates, stateSetters);
      await completeQueuedTravelRoute();
      return;
    }

    const travelCost = data.travelCost ?? 0;
    if (travelCost > 0) {
      const hopSuffix = route.totalHops > 1
        ? ` (${currentHop}/${route.totalHops} to ${route.finalDestinationName})`
        : '';
      pushLog({
        timestamp: nowStamp(),
        type: 'info',
        message: `Travelling to ${data.zone.name}${hopSuffix}...`,
      });

      setTravelPlaybackData({
        totalTurns: travelCost,
        destinationName: data.zone.name,
        events: data.events,
        aborted: data.aborted,
        refundedTurns: data.refundedTurns,
        playerHpBefore: hpBefore,
        playerMaxHp,
        respawnedToName: data.respawnedTo?.townName,
        currentHop,
        totalHops: route.totalHops,
        finalDestinationName: route.finalDestinationName,
        stateUpdates: (data as any).stateUpdates,
      });
      setPlaybackActive(true);
      return;
    }

    setActiveZoneId(data.zone.id);
    pushLog({ timestamp: nowStamp(), type: 'success', message: `Arrived at ${data.zone.name}.` });

    if (route.remainingZoneIds.length > 0) {
      applyStateUpdates((data as any).stateUpdates, stateSetters);
      await executeNextTravelHop();
      return;
    }

    applyStateUpdates((data as any).stateUpdates, stateSetters);
    await completeQueuedTravelRoute();
  };

  const abandonLootAndTravel = async () => {
    if (!confirmAbandonLoot) return;
    const zoneId = confirmAbandonLoot.travelZoneId;
    if (pendingLootSession) {
      await claimLoot(pendingLootSession.sessionId, []).catch(() => {});
      setPendingLootSession(null);
    }
    pendingLootQueueRef.current = [];
    setConfirmAbandonLoot(null);
    await handleTravelToZone(zoneId);
  };

  const handleTravelToZone = async (id: string) => {
    if (pendingLootSession) {
      setConfirmAbandonLoot({ travelZoneId: id });
      return;
    }

    if (!activeZoneId) return;
    if (id === activeZoneId) return;

    const route = findShortestZonePath(activeZoneId, id, zoneConnections);
    if (!route) {
      setActionError('No route to that zone');
      return;
    }

    const hops = route.slice(1);
    if (hops.length === 0) return;

    const finalDestinationName = zones.find((zone) => zone.id === id)?.name ?? 'that zone';
    travelRouteRef.current = {
      remainingZoneIds: hops,
      totalHops: hops.length,
      finalDestinationName,
    };

    await runAction('travel', async () => {
      await executeNextTravelHop();
    });
  };

  const handleTravelPlaybackComplete = async () => {
    if (travelPlaybackData) {
      if (travelPlaybackData.aborted && travelPlaybackData.respawnedToName) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `You were knocked out and woke up in ${travelPlaybackData.respawnedToName}.`,
        });
      } else if (travelPlaybackData.aborted) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `Travel to ${travelPlaybackData.destinationName} failed. You fled back to safety.`,
        });
      } else {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Arrived at ${travelPlaybackData.destinationName}.`,
        });
      }
      for (const event of travelPlaybackData.events) {
        const losses = event.details?.durabilityLost;
        if (Array.isArray(losses)) logDurabilityWarnings(losses);
      }
    }
    await finalizeTravelPlayback();
  };

  const finalizeTravelPlayback = async () => {
    const currentPlayback = travelPlaybackData;
    if (!currentPlayback) return;

    const shouldContinueRoute =
      !currentPlayback.aborted &&
      (travelRouteRef.current?.remainingZoneIds.length ?? 0) > 0;

    const savedStateUpdates = currentPlayback.stateUpdates;
    setTravelPlaybackData(null);
    setPlaybackActive(false);

    if (currentPlayback.aborted) {
      travelRouteRef.current = null;
    }

    if (shouldContinueRoute) {
      applyStateUpdates(savedStateUpdates, stateSetters);
      await executeNextTravelHop();
      return;
    }

    applyStateUpdates(savedStateUpdates, stateSetters);
    await completeQueuedTravelRoute();
  };

  const handleTravelPlaybackSkip = async () => {
    if (travelPlaybackData) {
      pushLog(...mapPlaybackEventsToLogs(travelPlaybackData.events));

      if (travelPlaybackData.aborted && travelPlaybackData.respawnedToName) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `You were knocked out and woke up in ${travelPlaybackData.respawnedToName}.`,
        });
      } else if (travelPlaybackData.aborted) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `Travel to ${travelPlaybackData.destinationName} failed. You fled back to safety.`,
        });
      } else {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Arrived at ${travelPlaybackData.destinationName}.`,
        });
      }
    }
    await finalizeTravelPlayback();
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
        applyStateUpdates((result.data as any).stateUpdates, stateSetters);
        pushLog({ timestamp: nowStamp(), type: 'success', message: `Rested ${actualTurns.toLocaleString()} turns, healed ${Math.round(healed)} HP` });
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
    handleTravelToZone,
    confirmAbandonLoot,
    abandonLootAndTravel,
    cancelAbandonLoot: () => setConfirmAbandonLoot(null),

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
    explorationPlaybackData,
    travelPlaybackData,

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
    tutorialStep, skipTutorial, advanceTutorial,

    // Combat log lazy loading
    combatLogPrefetch,

    // Guild
    guildTaxRate,

    // Home Town
    homeTownId: playerSettings.homeTownId,
    handleSetHomeTown: playerSettings.handleSetHomeTown,

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
    handleStartExploration,
    handleExplorationPlaybackComplete,
    handlePlaybackSkip,
    handleStartCombat,
    handleSelectStrategy,
    handleCombatPlaybackComplete,
    handleTravelPlaybackComplete,
    handleTravelPlaybackSkip,
    handleMine,
    handleCraft,
    handleSalvageItem,
    handleSalvageBatch,
    handleForgeUpgrade,
    handleForgeReroll,
    handleDestroyItem,
    handleRepairItem,
    handleRepairAllEquipped,
    handleUseItem,
    handleEquipItem,
    handleUnequipSlot,
    handleAllocateAttribute,
    loadAll,
    loadTurnsAndHp,
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
    pendingLootSession,
    handleSellItem,
    handleSellBatch,
    handleDepositItem,
    handleDepositBatch,
    handleWithdrawItem,
    handleWithdrawBatch,
    handleClaimLoot,
    handleDismissLoot,
    handleReopenLoot,

    // State update helpers
    stateSetters,

    // Casino & Training
    handleExchangeGold,
    handlePlaceBet,

    // Loot reveal
    lootRevealItems,
    handleDismissLootReveal,
  };
}
