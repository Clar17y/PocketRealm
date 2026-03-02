import { useCallback, useEffect, useRef, useState } from 'react';
import { getLatestVersion, CHANGELOG_STORAGE_KEY } from '@/lib/changelog';
import { useCombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';
import type { ConfirmRarity } from '@/lib/rarity';
import { updateTutorialStep } from '@/lib/api';
import {
  TUTORIAL_STEP_WELCOME,
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
  destroyInventoryItem,
  equip,
  forgeReroll,
  forgeUpgrade,
  getAchievements,
  getAchievementUnclaimedCount,
  getActiveTitle,
  claimAchievementReward,
  setActiveTitle,
  getBestiary,
  getCraftingRecipes,
  getEquipment,
  getGatheringNodes,
  getHpState,
  getInventory,
  getPlayer,
  getPlayerGuild,
  getEncounterSites,
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
  updatePlayerSettings,
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
  type PendingLootItem,
  type AchievementsResponse,
  type EventModifierBadge,
  type CombatActiveEvent,
  type PlayerSettings,
  type WorldEventResponse,
  type SkillPointState,
  exchangeGold,
  placeRouletteBet,
} from '@/lib/api';
import type { CombatTemplateData, ResourceState } from '@adventure/shared';
import type { RouletteBetType } from '@adventure/shared';
import { getSocket } from '@/lib/socket';
import { prettyStatName, formatStatValue } from '@/lib/statFormat';
import type { Screen, PendingEncounter, LastCombat, LastCombatLogEntry, CombatPlaybackItem, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { DEFAULT_CHARACTER_PROGRESSION } from './gameController.types';
export type { Screen, PendingEncounter, LastCombat, LastCombatLogEntry, CombatPlaybackItem, BestiarySkipEntry, ActivityLogEntry, CharacterProgression, HpState } from './gameController.types';
import { buildFightsList, buildLastCombat, isMobKnown } from './combatHelpers';
export { isMobKnown } from './combatHelpers';

type AttributeType = keyof CharacterProgression['attributes'];

const GATHERING_PAGE_SIZE = 8;
const PENDING_ENCOUNTER_PAGE_SIZE = 8;

export function useGameController({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [activeScreen, setActiveScreen] = useState<Screen>('home');
  const [turns, setTurns] = useState(0);
  const [gold, setGold] = useState(0);
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
  const [gatheringNodes, setGatheringNodes] = useState<Array<{
    id: string;
    templateId: string;
    zoneId: string;
    zoneName: string;
    resourceType: string;
    resourceTypeCategory: string;
    skillRequired: string;
    levelRequired: number;
    baseYield: number;
    remainingCapacity: number;
    maxCapacity: number;
    sizeName: string;
    discoveredAt: string;
    weathered: boolean;
    eventModifiers?: EventModifierBadge[];
  }>>([]);
  const [gatheringLoading, setGatheringLoading] = useState(false);
  const [gatheringError, setGatheringError] = useState<string | null>(null);
  const [gatheringPage, setGatheringPage] = useState(1);
  const [gatheringZoneFilter, setGatheringZoneFilter] = useState('all');
  const [gatheringResourceTypeFilter, setGatheringResourceTypeFilter] = useState('all');
  const [activeGatheringSkill, setActiveGatheringSkill] = useState<'mining' | 'foraging' | 'woodcutting'>('mining');
  const [gatheringPagination, setGatheringPagination] = useState({
    page: 1,
    pageSize: GATHERING_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [gatheringFilters, setGatheringFilters] = useState<{
    zones: Array<{ id: string; name: string }>;
    resourceTypes: string[];
  }>({
    zones: [],
    resourceTypes: [],
  });
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
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [pendingEncounters, setPendingEncounters] = useState<PendingEncounter[]>([]);
  const [pendingEncountersLoading, setPendingEncountersLoading] = useState(false);
  const [pendingEncountersError, setPendingEncountersError] = useState<string | null>(null);
  const [pendingEncounterPage, setPendingEncounterPage] = useState(1);
  const [pendingEncounterZoneFilter, setPendingEncounterZoneFilter] = useState('all');
  const [pendingEncounterMobFilter, setPendingEncounterMobFilter] = useState('all');
  const [pendingEncounterSort, setPendingEncounterSort] = useState<'recent' | 'danger'>('danger');
  const [pendingEncounterPagination, setPendingEncounterPagination] = useState({
    page: 1,
    pageSize: PENDING_ENCOUNTER_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [pendingEncounterFilters, setPendingEncounterFilters] = useState<{
    zones: Array<{ id: string; name: string }>;
    mobs: Array<{ id: string; name: string }>;
  }>({
    zones: [],
    mobs: [],
  });
  const latestPendingRequestRef = useRef(0);
  const [pendingClockMs, setPendingClockMs] = useState(() => Date.now());
  const [lastCombat, setLastCombat] = useState<LastCombat | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [bestiaryMobs, setBestiaryMobs] = useState<Array<{
    id: string;
    name: string;
    level: number;
    isDiscovered: boolean;
    killCount: number;
    stats: { hp: number; accuracy: number; defence: number };
    zones: string[];
    description: string;
    drops: Array<{
      item: { id: string; name: string; itemType: string; tier: number };
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      dropRate: number;
      minQuantity: number;
      maxQuantity: number;
    }>;
    prefixesEncountered: string[];
    explorationTier: number;
    tierLocked: boolean;
    bossRotation?: {
      totalRounds: number;
      revealedRounds: number;
      actions: Array<{
        round: number;
        actionName: string;
        targetMode: 'single_target' | 'aoe';
        isTelegraphed: boolean;
      }>;
    };
  }>>([]);
  const [bestiaryLoading, setBestiaryLoading] = useState(false);
  const [bestiaryError, setBestiaryError] = useState<string | null>(null);
  const [bestiaryPrefixSummary, setBestiaryPrefixSummary] = useState<Array<{
    prefix: string;
    displayName: string;
    totalKills: number;
    discovered: boolean;
  }>>([]);
  const [hpState, setHpState] = useState<HpState>({ currentHp: 100, maxHp: 100, regenPerSecond: 0.4, isRecovering: false, recoveryCost: null });
  const [staminaState, setStaminaState] = useState<ResourceState>({ current: 100, max: 100, regenPerRound: 10, regenPerSecond: 1 });
  const [manaState, setManaState] = useState<ResourceState>({ current: 50, max: 50, regenPerRound: 5, regenPerSecond: 0.5 });
  const [skillPointState, setSkillPointState] = useState<SkillPointState | null>(null);
  const [templates, setTemplates] = useState<CombatTemplateData[]>([]);
  const [pvpNotificationCount, setPvpNotificationCount] = useState(0);
  const [activeEvents, setActiveEvents] = useState<WorldEventResponse[]>([]);
  const [autoPotionThreshold, setAutoPotionThreshold] = useState(0);
  const [tutorialStep, setTutorialStep] = useState<number>(TUTORIAL_COMPLETED);
  const [combatLogSpeedMs, setCombatLogSpeedMs] = useState(800);
  const [explorationSpeedMs, setExplorationSpeedMs] = useState(800);
  const [autoSkipKnownCombat, setAutoSkipKnownCombat] = useState(false);
  const [defaultExploreTurns, setDefaultExploreTurns] = useState(100);
  const [quickRestHealPercent, setQuickRestHealPercent] = useState(100);
  const [defaultRefiningMax, setDefaultRefiningMax] = useState(false);
  const [lowHpWarning, setLowHpWarning] = useState(true);
  const [confirmRarity, setConfirmRarity] = useState<ConfirmRarity>('uncommon');
  const [guildTaxRate, setGuildTaxRate] = useState(0);
  const [achievementData, setAchievementData] = useState<AchievementsResponse | null>(null);
  const [achievementUnclaimedCount, setAchievementUnclaimedCount] = useState(0);
  const [activeTitle, setActiveTitleState] = useState<string | null>(null);
  const combatLogPrefetch = useCombatLogPrefetch();
  const [playbackActive, setPlaybackActive] = useState(false);
  const [showChangelog, setShowChangelog] = useState(false);
  const [combatPlaybackQueue, setCombatPlaybackQueue] = useState<Array<{
    room?: number;
    mobName: string;
    mobDisplayName: string;
    mobTemplateId: string;
    mobPrefix: string | null;
    outcome: string;
    combatantAMaxHp: number;
    playerStartHp: number;
    combatantBMaxHp: number;
    log: LastCombatLogEntry[] | null;
    combatLogId?: string;
    rewards: LastCombat['rewards'];
    activeEvents?: CombatActiveEvent[];
  }> | null>(null);
  const [combatPlaybackIndex, setCombatPlaybackIndex] = useState(0);
  const [roomTransition, setRoomTransition] = useState<{ entering: number } | null>(null);
  const pendingCombatRewardsRef = useRef<LastCombat['rewards'] | null>(null);
  const siteJustClearedRef = useRef(false);
  const combatPendingLootRef = useRef<string | null>(null);
  const pendingLootQueueRef = useRef<string[]>([]);
  const arrivedInTownRef = useRef(false);
  const lastEventLogTimeRef = useRef(0);
  const combatPlaybackData = combatPlaybackQueue?.[combatPlaybackIndex] ?? null;

  // Lazy-load current fight's combat log and pre-fetch next fight
  useEffect(() => {
    if (!combatPlaybackQueue) return;
    const currentFight = combatPlaybackQueue[combatPlaybackIndex];
    if (!currentFight) return;

    // Load current fight's log if not yet loaded
    if (!currentFight.log && currentFight.combatLogId) {
      void combatLogPrefetch.fetchLog(currentFight.combatLogId).then(log => {
        setCombatPlaybackQueue(prev => {
          if (!prev) return prev;
          const updated = [...prev];
          updated[combatPlaybackIndex] = { ...updated[combatPlaybackIndex], log: log as LastCombatLogEntry[] };
          return updated;
        });
      });
    }

    // Pre-fetch next fight's log
    const nextFight = combatPlaybackQueue[combatPlaybackIndex + 1];
    if (nextFight?.combatLogId) {
      combatLogPrefetch.prefetch(nextFight.combatLogId);
    }
  }, [combatPlaybackQueue, combatPlaybackIndex, combatLogPrefetch]);
  const [explorationPlaybackData, setExplorationPlaybackData] = useState<{
    totalTurns: number;
    zoneName: string;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    aborted: boolean;
    refundedTurns: number;
    playerHpBeforeExploration: number;
    playerMaxHp: number;
    pendingLootSessionIds?: string[];
  } | null>(null);
  const [travelPlaybackData, setTravelPlaybackData] = useState<{
    totalTurns: number;
    destinationName: string;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    aborted: boolean;
    refundedTurns: number;
    playerHpBefore: number;
    playerMaxHp: number;
    respawnedToName?: string;
    pendingLootSessionId?: string;
  } | null>(null);

  const loadTurnsAndHp = useCallback(async () => {
    const [turnRes, hpRes, resourceRes] = await Promise.all([getTurns(), getHpState(), getResources()]);
    if (turnRes.data) setTurns(turnRes.data.currentTurns);
    if (hpRes.data) setHpState(hpRes.data);
    if (resourceRes.data) {
      setStaminaState(resourceRes.data.stamina);
      setManaState(resourceRes.data.mana);
    }
  }, []);

  const loadPvpNotificationCount = useCallback(async () => {
    const result = await getPvpNotificationCount();
    if (result.data) {
      setPvpNotificationCount(result.data.count);
    }
  }, []);

  const loadAchievements = useCallback(async () => {
    const res = await getAchievements();
    if (res.data) {
      setAchievementData(res.data);
      setAchievementUnclaimedCount(res.data.unclaimedCount);
    }
  }, []);

  const loadAchievementUnclaimedCount = useCallback(async () => {
    const res = await getAchievementUnclaimedCount();
    if (res.data) setAchievementUnclaimedCount(res.data.unclaimedCount);
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

    const [turnRes, playerRes, skillsRes, zonesRes, invRes, equipRes, recipesRes, hpRes, resourceRes, skillPointRes] = await Promise.all([
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
      setAutoPotionThreshold(playerRes.data.player.autoPotionThreshold ?? 0);
      setTutorialStep(playerRes.data.player.tutorialStep ?? TUTORIAL_COMPLETED);
      setCombatLogSpeedMs(playerRes.data.player.combatLogSpeedMs ?? 800);
      setExplorationSpeedMs(playerRes.data.player.explorationSpeedMs ?? 800);
      setAutoSkipKnownCombat(playerRes.data.player.autoSkipKnownCombat ?? false);
      setDefaultExploreTurns(playerRes.data.player.defaultExploreTurns ?? 100);
      setQuickRestHealPercent(playerRes.data.player.quickRestHealPercent ?? 100);
      setDefaultRefiningMax(playerRes.data.player.defaultRefiningMax ?? false);
      setLowHpWarning(playerRes.data.player.lowHpWarning ?? true);
      setConfirmRarity(playerRes.data.player.confirmRarity ?? 'uncommon');
    }
    if (skillsRes.data) setSkills(skillsRes.data.skills);
    if (hpRes.data) setHpState(hpRes.data);
    if (resourceRes.data) {
      setStaminaState(resourceRes.data.stamina);
      setManaState(resourceRes.data.mana);
    }
    if (skillPointRes.data) setSkillPointState(skillPointRes.data);
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
    if (isAuthenticated) {
      void loadAll();
      void loadPvpNotificationCount();
      void loadAchievementUnclaimedCount();
      void getActiveTitle().then((res) => {
        if (res.data) setActiveTitleState(res.data.activeTitle);
      });
      // Auto-show changelog if unseen
      const latestVer = getLatestVersion();
      if (latestVer && localStorage.getItem(CHANGELOG_STORAGE_KEY) !== latestVer) {
        setShowChangelog(true);
      }
      const interval = setInterval(() => void loadTurnsAndHp(), 10000);
      // Poll PvP notifications less frequently (60s)
      const pvpInterval = setInterval(() => void loadPvpNotificationCount(), 60000);
      const achievementPollInterval = setInterval(() => void loadAchievementUnclaimedCount(), 60_000);
      return () => { clearInterval(interval); clearInterval(pvpInterval); clearInterval(achievementPollInterval); };
    }
  }, [isAuthenticated, loadAll, loadTurnsAndHp, loadPvpNotificationCount, loadAchievementUnclaimedCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = getSocket();
    const handleAchievementUnlocked = (data: { id: string; title: string; category: string }) => {
      const showToast = (window as unknown as Record<string, unknown>).__showAchievementToast as
        | ((toast: { id: string; title: string; category: string }) => void)
        | undefined;
      if (showToast) showToast(data);
      void loadAchievementUnclaimedCount();
    };
    socket.on('achievement_unlocked', handleAchievementUnlocked);
    return () => { socket.off('achievement_unlocked', handleAchievementUnlocked); };
  }, [isAuthenticated, loadAchievementUnclaimedCount]);

  const refreshPendingEncounters = useCallback(async (options?: { background?: boolean }) => {
    if (!isAuthenticated) return;
    const isBackground = options?.background ?? false;
    const requestId = ++latestPendingRequestRef.current;

    if (!isBackground) {
      setPendingEncountersLoading(true);
    }
    setPendingEncountersError(null);

    try {
      const res = await getEncounterSites({
        page: pendingEncounterPage,
        pageSize: PENDING_ENCOUNTER_PAGE_SIZE,
        zoneId: pendingEncounterZoneFilter === 'all' ? undefined : pendingEncounterZoneFilter,
        mobFamilyId: pendingEncounterMobFilter === 'all' ? undefined : pendingEncounterMobFilter,
        sort: pendingEncounterSort,
      });

      if (latestPendingRequestRef.current !== requestId) return;

      if (!res.data) {
        setPendingEncounters([]);
        setPendingEncounterPagination({
          page: 1,
          pageSize: PENDING_ENCOUNTER_PAGE_SIZE,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        });
        setPendingEncounterFilters({ zones: [], mobs: [] });
        setPendingEncountersError(res.error?.message ?? 'Failed to load encounter sites');
        return;
      }

      if (pendingEncounterPage > res.data.pagination.totalPages) {
        setPendingEncounterPage(res.data.pagination.totalPages);
        return;
      }

      setPendingEncounters(
        res.data.encounterSites.map((site) => ({
          encounterSiteId: site.encounterSiteId,
          zoneId: site.zoneId,
          zoneName: site.zoneName,
          mobFamilyId: site.mobFamilyId,
          mobFamilyName: site.mobFamilyName,
          siteName: site.siteName,
          size: site.size,
          totalMobs: site.totalMobs,
          aliveMobs: site.aliveMobs,
          defeatedMobs: site.defeatedMobs,
          decayedMobs: site.decayedMobs,
          nextMobTemplateId: site.nextMobTemplateId,
          nextMobName: site.nextMobName,
          nextMobPrefix: site.nextMobPrefix,
          nextMobDisplayName: site.nextMobDisplayName,
          discoveredAt: site.discoveredAt,
          clearStrategy: site.clearStrategy,
          currentRoom: site.currentRoom,
          totalRooms: site.totalRooms,
          roomMobCounts: site.roomMobCounts,
          eventModifiers: site.eventModifiers,
          totalTurnCost: site.totalTurnCost,
        }))
      );
      setPendingEncounterPagination(res.data.pagination);
      setPendingEncounterFilters({
        zones: res.data.filters.zones,
        mobs: res.data.filters.mobFamilies,
      });
    } finally {
      if (!isBackground && latestPendingRequestRef.current === requestId) {
        setPendingEncountersLoading(false);
      }
    }
  }, [isAuthenticated, pendingEncounterPage, pendingEncounterZoneFilter, pendingEncounterMobFilter, pendingEncounterSort]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeScreen !== 'combat') return;

    const tick = () => {
      setPendingClockMs(Date.now());
      void refreshPendingEncounters({ background: true });
    };

    setPendingClockMs(Date.now());
    void refreshPendingEncounters();
    const interval = setInterval(tick, 15000);
    return () => clearInterval(interval);
  }, [isAuthenticated, activeScreen, refreshPendingEncounters]);

  const loadBestiary = useCallback(async () => {
    setBestiaryError(null);
    setBestiaryLoading(true);
    try {
      const { data, error } = await getBestiary();
      if (data) {
        setBestiaryMobs(data.mobs);
        setBestiaryPrefixSummary(data.prefixSummary);
      }
      else setBestiaryError(error?.message ?? 'Failed to load bestiary');
    } finally {
      setBestiaryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && (activeScreen === 'bestiary' || activeScreen === 'combat')) {
      void loadBestiary();
    }
  }, [isAuthenticated, activeScreen, loadBestiary]);

  const loadGatheringNodes = useCallback(async () => {
    if (!isAuthenticated) return;

    setGatheringLoading(true);
    setGatheringError(null);

    const { data, error } = await getGatheringNodes({
      page: gatheringPage,
      pageSize: GATHERING_PAGE_SIZE,
      zoneId: gatheringZoneFilter === 'all' ? undefined : gatheringZoneFilter,
      resourceType: gatheringResourceTypeFilter === 'all' ? undefined : gatheringResourceTypeFilter,
      skillRequired: activeGatheringSkill,
    });

    if (data) {
      if (gatheringPage > data.pagination.totalPages) {
        setGatheringPage(data.pagination.totalPages);
        setGatheringLoading(false);
        return;
      }

      setGatheringNodes(data.nodes);
      setGatheringPagination(data.pagination);
      setGatheringFilters(data.filters);
    } else {
      setGatheringNodes([]);
      setGatheringError(error?.message ?? 'Failed to load gathering nodes');
    }

    setGatheringLoading(false);
  }, [isAuthenticated, gatheringPage, gatheringZoneFilter, gatheringResourceTypeFilter, activeGatheringSkill]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeScreen !== 'gathering') return;
    void loadGatheringNodes();
  }, [isAuthenticated, activeScreen, loadGatheringNodes]);

  const handleGatheringPageChange = useCallback((page: number) => {
    setGatheringPage(page);
  }, []);

  const handleGatheringZoneFilterChange = useCallback((zoneId: string) => {
    setGatheringZoneFilter(zoneId);
    setGatheringPage(1);
  }, []);

  const handleGatheringResourceTypeFilterChange = useCallback((resourceType: string) => {
    setGatheringResourceTypeFilter(resourceType);
    setGatheringPage(1);
  }, []);

  const handlePendingEncounterPageChange = useCallback((page: number) => {
    setPendingEncounterPage(page);
  }, []);

  const handlePendingEncounterZoneFilterChange = useCallback((zoneId: string) => {
    setPendingEncounterZoneFilter(zoneId);
    setPendingEncounterPage(1);
  }, []);

  const handlePendingEncounterMobFilterChange = useCallback((mobTemplateId: string) => {
    setPendingEncounterMobFilter(mobTemplateId);
    setPendingEncounterPage(1);
  }, []);

  const handlePendingEncounterSortChange = useCallback((sort: 'recent' | 'danger') => {
    setPendingEncounterSort(sort);
    setPendingEncounterPage(1);
  }, []);

  const getActiveTab = () => {
    if (['home', 'skills', 'zones', 'bestiary', 'rest', 'worldEvents', 'achievements', 'leaderboard', 'casino', 'training', 'admin'].includes(activeScreen)) return 'home';
    if (['explore', 'gathering', 'crafting', 'forge'].includes(activeScreen)) return 'explore';
    if (['inventory', 'equipment'].includes(activeScreen)) return 'inventory';
    if (['combat', 'arena', 'templates', 'talentTree'].includes(activeScreen)) return 'combat';
    if (activeScreen === 'guild') return 'guild';
    return 'home';
  };

  const nowStamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const pushLog = (...entries: ActivityLogEntry[]) => {
    setActivityLog((prev) => [...entries, ...prev].slice(0, 100));
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
          message: `Your ${loss.itemName} is about to break! (${loss.newDurability}/${loss.maxDurability})`,
        });
      }
    }
    if (entries.length > 0) pushLog(...entries);
  };

  const currentZone =
    zones.find((z) => z.id === activeZoneId) ??
    zones.find((z) => z.discovered) ??
    zones.find((z) => z.isStarter) ??
    null;

  const ownedByTemplateId = (() => {
    const map = new Map<string, number>();
    // Use materialTotals (backpack + stash combined) so crafting sees all owned materials
    for (const [templateId, qty] of Object.entries(materialTotals)) {
      map.set(templateId, qty);
    }
    return map;
  })();

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
    setExplorationPlaybackData(null);
    combatLogPrefetch.clear();
    setPlaybackActive(false);
    await advanceTutorial(TUTORIAL_STEP_EXPLORE);
    await loadAll();
    if (pendingIds?.length) {
      pendingLootQueueRef.current = pendingIds.slice(1);
      await activatePendingLoot(pendingIds[0]);
    }
  };

  const handlePlaybackSkip = async () => {
    // Dump all remaining events to activity log at once
    if (explorationPlaybackData) {
      const entries = explorationPlaybackData.events
        .slice()
        .reverse()
        .map((event) => ({
          timestamp: nowStamp(),
          type: (event.type === 'ambush_defeat'
            ? 'danger'
            : event.type === 'ambush_victory' || event.type === 'encounter_site' || event.type === 'resource_node'
              ? 'success'
              : 'info') as 'info' | 'success' | 'danger',
          message: `Turn ${event.turn}: ${event.description}`,
        }));
      pushLog(
        {
          timestamp: nowStamp(),
          type: 'info',
          message: `Explored ${explorationPlaybackData.totalTurns.toLocaleString()} turns in ${explorationPlaybackData.zoneName}.`,
        },
        ...entries,
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

      const rewards: LastCombat['rewards'] = {
        xp: data.rewards.xp,
        loot: data.rewards.loot,
        siteCompletion: data.rewards.siteCompletion ?? null,
        skillXp: data.rewards.skillXp
          ? {
              skillType: data.rewards.skillXp.skillType,
              xpGained: data.rewards.skillXp.xpGained,
              xpAfterEfficiency: data.rewards.skillXp.xpAfterEfficiency,
              efficiency: data.rewards.skillXp.efficiency,
              leveledUp: data.rewards.skillXp.leveledUp,
              newLevel: data.rewards.skillXp.newLevel,
              characterXpGain: data.rewards.skillXp.characterXpGain,
              characterXpAfter: data.rewards.skillXp.characterXpAfter,
              characterLevelBefore: data.rewards.skillXp.characterLevelBefore,
              characterLevelAfter: data.rewards.skillXp.characterLevelAfter,
              attributePointsAfter: data.rewards.skillXp.attributePointsAfter,
              characterLeveledUp: data.rewards.skillXp.characterLeveledUp,
            }
          : null,
      };

      // Build playback queue from fights[] or single-element queue for zone combat
      if (data.combat.fights && data.combat.fights.length > 0) {
        const queue = data.combat.fights.map((fight) => {
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
            combatantBMaxHp: fight.mobMaxHp,
            log: fight.log?.length ? (fight.log as LastCombatLogEntry[]) : null,
            combatLogId: fightLogId,
            activeEvents: data.activeEvents,
            rewards: {
              xp: fight.xp,
              loot: fight.loot,
              siteCompletion: null as LastCombat['rewards']['siteCompletion'],
              skillXp: fight.skillXp
                ? {
                    skillType: fight.skillXp.skillType,
                    xpGained: fight.skillXp.xpGained,
                    xpAfterEfficiency: fight.skillXp.xpAfterEfficiency,
                    efficiency: fight.skillXp.efficiency,
                    leveledUp: fight.skillXp.leveledUp,
                    newLevel: fight.skillXp.newLevel,
                    characterXpGain: fight.skillXp.characterXpGain,
                    characterXpAfter: fight.skillXp.characterXpAfter,
                    characterLevelBefore: fight.skillXp.characterLevelBefore,
                    characterLevelAfter: fight.skillXp.characterLevelAfter,
                    attributePointsAfter: fight.skillXp.attributePointsAfter,
                    characterLeveledUp: fight.skillXp.characterLeveledUp,
                  }
                : null,
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

      const skillXp = data.rewards?.skillXp;
      if (skillXp?.leveledUp) {
        const skillName = skillXp.skillType.charAt(0).toUpperCase() + skillXp.skillType.slice(1);
        pushLog({ timestamp: nowStamp(), type: 'success', message: `🎉 ${skillName} leveled up to ${skillXp.newLevel}!` });
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

      await Promise.all([loadAll(), loadTurnsAndHp(), loadBestiary()]);
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

  const handleCombatPlaybackComplete = () => {
    if (combatPlaybackQueue && combatPlaybackIndex < combatPlaybackQueue.length - 1) {
      const currentFight = combatPlaybackQueue[combatPlaybackIndex];
      const nextFight = combatPlaybackQueue[combatPlaybackIndex + 1];

      // Room transition: show interstitial briefly before advancing
      if (currentFight?.room && nextFight?.room && currentFight.room !== nextFight.room) {
        setRoomTransition({ entering: nextFight.room });
        setTimeout(() => {
          setRoomTransition(null);
          setCombatPlaybackIndex(prev => prev + 1);
        }, 1500);
        return;
      }

      // More fights in the queue — advance to next
      setCombatPlaybackIndex(combatPlaybackIndex + 1);
      return;
    }

    // All fights done — finalize lastCombat with aggregated rewards
    const lastFight = combatPlaybackQueue?.[combatPlaybackQueue.length - 1];
    if (lastFight) {
      const aggregatedRewards = pendingCombatRewardsRef.current ?? lastFight.rewards;
      setLastCombat(buildLastCombat(combatPlaybackQueue!, aggregatedRewards));
    }
    setCombatPlaybackQueue(null);
    setCombatPlaybackIndex(0);
    setRoomTransition(null);
    pendingCombatRewardsRef.current = null;
    combatLogPrefetch.clear();
    setPlaybackActive(false);
    void refreshPendingEncounters();

    if (siteJustClearedRef.current) {
      siteJustClearedRef.current = false;
      advanceTutorial(TUTORIAL_STEP_COMBAT);
    }

    const pendingId = combatPendingLootRef.current;
    combatPendingLootRef.current = null;
    if (pendingId) {
      void activatePendingLoot(pendingId);
    }
  };

  const handleNavigate = (screen: string) => {
    // Auto-skip any active playback when navigating away
    if (playbackActive) {
      if (explorationPlaybackData) {
        handlePlaybackSkip();
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
        handleTravelPlaybackSkip();
      }
    }
    // Clear last combat log when leaving the combat screen — it's in history if needed
    if (activeScreen === 'combat' && screen !== 'combat') {
      setLastCombat(null);
    }
    setActiveScreen(screen as Screen);
  };

  const handleMine = async (playerNodeId: string, turnSpend: number) => {
    if (!activeZoneId) return;

    await runAction('gathering', async () => {
      const res = await mine(playerNodeId, turnSpend, activeZoneId);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Gathering failed');
        return;
      }

      setTurns(data.turns.currentTurns);

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
        const bonusPct = Math.round(Math.abs(data.yieldBreakdown.eventModifier - 1) * 100);
        const rawTotal = data.yieldBreakdown.rawTotalYield;
        const yieldDiff = rawTotal != null ? data.results.totalYield - rawTotal : null;
        newLogs.push({
          timestamp: nowStamp(),
          type: isUp ? 'success' : 'warning',
          message: `${data.yieldBreakdown.eventTitle}: ${isUp ? '+' : '-'}${bonusPct}% yield ${isUp ? 'bonus' : 'penalty'}${yieldDiff != null ? ` (${yieldDiff > 0 ? '+' : ''}${yieldDiff} items)` : ''}`,
        });
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
      await Promise.all([loadAll(), loadGatheringNodes()]);
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
      await loadAll();
      advanceTutorial(TUTORIAL_STEP_REFINE);
      advanceTutorial(TUTORIAL_STEP_CRAFT);
    });
  };

  const handleSalvageItem = async (itemId: string) => {
    await runAction('salvage', async () => {
      const res = await salvage(itemId);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Salvage failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      const materialSummary = data.salvage.returnedMaterials
        .map((entry) => `${entry.name} x${entry.quantity}`)
        .join(', ');
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Salvaged item for: ${materialSummary}.`,
      });
      await loadAll();
    });
  };

  const handleSalvageBatch = async (itemIds: string[]) => {
    await runAction('salvage_batch', async () => {
      const res = await salvageBatch(itemIds);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Batch salvage failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      const materialSummary = data.returnedMaterials
        .map((entry) => `${entry.name} x${entry.quantity}`)
        .join(', ');
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Salvaged ${data.salvaged.length} items (${data.totalTurnCost} turns). Recovered: ${materialSummary}`,
      });
      await loadAll();
    });
  };

  const handleForgeUpgrade = async (itemId: string, sacrificialItemId: string) => {
    await runAction('forge_upgrade', async () => {
      const res = await forgeUpgrade(itemId, sacrificialItemId);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Forge upgrade failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      const fromLabel = data.forge.fromRarity.charAt(0).toUpperCase() + data.forge.fromRarity.slice(1);
      const toLabel = data.forge.toRarity.charAt(0).toUpperCase() + data.forge.toRarity.slice(1);
      const chancePct = (data.forge.successChance * 100).toFixed(1);

      if (data.forge.success) {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Forge success: ${fromLabel} -> ${toLabel} (${chancePct}% chance). Sacrificial item consumed.`,
        });
      } else {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Forge failed at ${fromLabel} (${chancePct}% chance). Target and sacrifice consumed.`,
        });
      }

      await loadAll();
    });
  };

  const handleForgeReroll = async (itemId: string, sacrificialItemId: string) => {
    await runAction('forge_reroll', async () => {
      const res = await forgeReroll(itemId, sacrificialItemId);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Forge reroll failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      const rarityLabel = data.forge.rarity.charAt(0).toUpperCase() + data.forge.rarity.slice(1);
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Re-rolled ${rarityLabel} item bonus stats. Sacrificial duplicate consumed.`,
      });

      await loadAll();
    });
  };

  const handleDestroyItem = async (itemId: string) => {
    await runAction('destroy', async () => {
      const res = await destroyInventoryItem(itemId);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Destroy failed');
        return;
      }
      await loadAll();
    });
  };

  const handleRepairItem = async (itemId: string) => {
    await runAction('repair', async () => {
      const res = await repairItem(itemId);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Repair failed');
        return;
      }
      if (data.turns) setTurns(data.turns.currentTurns);
      await loadAll();
    });
  };

  const handleRepairAllEquipped = async () => {
    await runAction('repair_all', async () => {
      const res = await repairAllEquipped();
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Repair all failed');
        return;
      }
      if (data.turns) setTurns(data.turns.currentTurns);
      await loadAll();
    });
  };

  const handleUseItem = async (itemId: string) => {
    await runAction('use_item', async () => {
      const res = await useItem(itemId);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Use item failed');
        return;
      }
      await loadAll();
    });
  };

  const handleEquipItem = async (itemId: string, slot: string) => {
    await runAction('equip', async () => {
      const res = await equip(itemId, slot);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Equip failed');
        return;
      }
      await loadAll();
      advanceTutorial(TUTORIAL_STEP_EQUIP);
    });
  };

  const handleUnequipSlot = async (slot: string) => {
    await runAction('unequip', async () => {
      const res = await unequip(slot);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Unequip failed');
        return;
      }
      await loadAll();
    });
  };

  const handleSellItem = async (itemId: string) => {
    await runAction('sell', async () => {
      const res = await sellItem(itemId);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Sell failed');
        return;
      }
      setGold(res.data.newGold);
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Sold item for ${res.data.goldEarned} gold`,
      });
      await loadAll();
    });
  };

  const handleSellBatch = async (itemIds: string[]) => {
    await runAction('sell_batch', async () => {
      const res = await sellBulk(itemIds);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Batch sell failed');
        return;
      }
      setGold(res.data.newGold);
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Sold ${res.data.soldCount} item(s) for ${res.data.totalGoldEarned} gold`,
      });
      await loadAll();
    });
  };

  const handleDepositItem = async (itemId: string) => {
    await runAction('deposit', async () => {
      const res = await depositToStash(itemId);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Deposit failed');
        return;
      }
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: 'Item deposited to stash',
      });
      await loadAll();
    });
  };

  const handleDepositBatch = async (itemIds: string[]) => {
    await runAction('deposit_batch', async () => {
      const res = await depositBatchToStash(itemIds);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Batch deposit failed');
        return;
      }
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `${res.data.depositedCount} item(s) deposited to stash`,
      });
      await loadAll();
    });
  };

  const handleWithdrawItem = async (itemId: string) => {
    await runAction('withdraw', async () => {
      const res = await withdrawFromStash(itemId);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Withdraw failed');
        return;
      }
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: 'Item withdrawn from stash',
      });
      await loadAll();
    });
  };

  const handleWithdrawBatch = async (itemIds: string[]) => {
    await runAction('withdraw_batch', async () => {
      const res = await withdrawBatchFromStash(itemIds);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Batch withdraw failed');
        return;
      }
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `${res.data.withdrawnCount} item(s) withdrawn from stash`,
      });
      await loadAll();
    });
  };

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
      await loadAll();
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

  const abandonLootAndTravel = async () => {
    if (!confirmAbandonLoot) return;
    const zoneId = confirmAbandonLoot.travelZoneId;
    if (pendingLootSession) {
      await claimLoot(pendingLootSession.sessionId, []).catch(() => {});
      setPendingLootSession(null);
    }
    pendingLootQueueRef.current = [];
    setConfirmAbandonLoot(null);
    await doTravel(zoneId);
  };

  const handleTravelToZone = async (id: string) => {
    if (pendingLootSession) {
      setConfirmAbandonLoot({ travelZoneId: id });
      return;
    }
    await doTravel(id);
  };

  const doTravel = async (id: string) => {
    const hpBefore = hpState.currentHp;

    await runAction('travel', async () => {
      const res = await travelToZone(id);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Travel failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      const arrivedInTown = data.zone.zoneType === 'town';

      // Breadcrumb return — instant, no playback
      if (data.breadcrumbReturn) {
        setActiveZoneId(data.zone.id);
        pushLog({ timestamp: nowStamp(), type: 'success', message: `Returned to ${data.zone.name}.` });
        await loadAll();
        if (arrivedInTown) advanceTutorial(TUTORIAL_STEP_TRAVEL);
        return;
      }

      // Trigger travel playback (progress bar + combat if ambushed)
      // Don't update activeZoneId or loadAll yet — defer until playback completes
      // so the map doesn't show "HERE" on the destination prematurely.
      const travelCost = data.travelCost ?? 0;
      if (travelCost > 0) {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Travelling to ${data.zone.name}...`,
        });

        if (arrivedInTown) arrivedInTownRef.current = true;
        setTravelPlaybackData({
          totalTurns: travelCost,
          destinationName: data.zone.name,
          events: data.events,
          aborted: data.aborted,
          refundedTurns: data.refundedTurns,
          playerHpBefore: hpBefore,
          playerMaxHp: hpState.maxHp,
          respawnedToName: data.respawnedTo?.townName,
          pendingLootSessionId: data.pendingLootSessionId,
        });
        setPlaybackActive(true);
      } else {
        // Zero-cost travel (shouldn't happen normally, but handle gracefully)
        setActiveZoneId(data.zone.id);
        pushLog({ timestamp: nowStamp(), type: 'success', message: `Arrived at ${data.zone.name}.` });
        await loadAll();
        if (arrivedInTown) advanceTutorial(TUTORIAL_STEP_TRAVEL);
      }
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
    const travelPendingId = travelPlaybackData?.pendingLootSessionId;
    setTravelPlaybackData(null);
    setPlaybackActive(false);
    await loadAll();

    if (arrivedInTownRef.current) {
      arrivedInTownRef.current = false;
      advanceTutorial(TUTORIAL_STEP_TRAVEL);
    }

    if (travelPendingId) {
      await activatePendingLoot(travelPendingId);
    }
  };

  const handleTravelPlaybackSkip = async () => {
    if (travelPlaybackData) {
      const entries = travelPlaybackData.events
        .slice()
        .reverse()
        .map((event) => ({
          timestamp: nowStamp(),
          type: (event.type === 'ambush_defeat' ? 'danger' : event.type === 'ambush_victory' ? 'success' : 'info') as 'info' | 'success' | 'danger',
          message: `Turn ${event.turn}: ${event.description}`,
        }));
      pushLog(...entries);

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

  const handleSetSetting = async <T>(key: keyof PlayerSettings, value: T, setter: (v: T) => void, prev: T) => {
    setter(value);
    const res = await updatePlayerSettings({ [key]: value });
    if (!res.data) setter(prev);
  };

  const handleSetAutoPotionThreshold = (value: number) =>
    handleSetSetting('autoPotionThreshold', value, setAutoPotionThreshold, autoPotionThreshold);
  const handleSetCombatLogSpeed = (value: number) =>
    handleSetSetting('combatLogSpeedMs', value, setCombatLogSpeedMs, combatLogSpeedMs);
  const handleSetExplorationSpeed = (value: number) =>
    handleSetSetting('explorationSpeedMs', value, setExplorationSpeedMs, explorationSpeedMs);
  const handleSetAutoSkipKnownCombat = (value: boolean) =>
    handleSetSetting('autoSkipKnownCombat', value, setAutoSkipKnownCombat, autoSkipKnownCombat);
  const handleSetDefaultExploreTurns = (value: number) =>
    handleSetSetting('defaultExploreTurns', value, setDefaultExploreTurns, defaultExploreTurns);
  const handleSetQuickRestHealPercent = (value: number) =>
    handleSetSetting('quickRestHealPercent', value, setQuickRestHealPercent, quickRestHealPercent);
  const handleSetDefaultRefiningMax = (value: boolean) =>
    handleSetSetting('defaultRefiningMax', value, setDefaultRefiningMax, defaultRefiningMax);
  const handleSetLowHpWarning = (value: boolean) =>
    handleSetSetting('lowHpWarning', value, setLowHpWarning, lowHpWarning);
  const handleSetConfirmRarity = (value: ConfirmRarity) =>
    handleSetSetting('confirmRarity', value, setConfirmRarity, confirmRarity);

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
        pushLog({ timestamp: nowStamp(), type: 'success', message: `Rested ${actualTurns.toLocaleString()} turns, healed ${Math.round(healed)} HP` });
      }
    });
  };

  const handleClaimAchievement = async (achievementId: string) => {
    const res = await claimAchievementReward(achievementId);
    if (res.data) {
      await loadAchievements();
      await loadAll();
    }
  };

  const handleSetActiveTitle = async (achievementId: string | null) => {
    const res = await setActiveTitle(achievementId);
    if (res.data) {
      setActiveTitleState(res.data.activeTitle);
    }
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
    trainingCooldown,
    setTrainingCooldown,
    zones,
    activeZoneId,
    setActiveZoneId,
    zoneConnections,
    undiscoveredZones,
    skills,
    characterProgression,
    inventory,
    equipment,
    gatheringNodes,
    gatheringLoading,
    gatheringError,
    gatheringPage,
    gatheringPagination,
    gatheringFilters,
    gatheringZoneFilter,
    gatheringResourceTypeFilter,
    activeGatheringSkill,
    setActiveGatheringSkill,
    craftingRecipes,
    zoneCraftingLevel,
    zoneCraftingName,
    activeCraftingSkill,
    setActiveCraftingSkill,
    activityLog,
    pushLog,
    pendingEncounters,
    pendingEncountersLoading,
    pendingEncountersError,
    pendingEncounterPage,
    pendingEncounterPagination,
    pendingEncounterFilters,
    pendingEncounterZoneFilter,
    pendingEncounterMobFilter,
    pendingEncounterSort,
    pendingClockMs,
    lastCombat,
    busyAction,
    actionError,
    bestiaryMobs,
    bestiaryLoading,
    bestiaryError,
    bestiaryPrefixSummary,
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
    autoPotionThreshold,
    setAutoPotionThreshold,
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

    // Tutorial
    tutorialStep, skipTutorial, advanceTutorial,

    // Combat log lazy loading
    combatLogPrefetch,

    // Guild
    guildTaxRate,

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
    handleGatheringPageChange,
    handleGatheringZoneFilterChange,
    handleGatheringResourceTypeFilterChange,
    handlePendingEncounterPageChange,
    handlePendingEncounterZoneFilterChange,
    handlePendingEncounterMobFilterChange,
    handlePendingEncounterSortChange,
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
    handleSetAutoPotionThreshold,
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

    // Casino & Training
    handleExchangeGold,
    handlePlaceBet,
  };
}

