import { useCallback, useEffect, useRef, useState } from 'react';
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
  getEncounterSites,
  getPvpNotificationCount,
  getSkills,
  getTurns,
  getZones,
  getZoneEvents,
  mine,
  repairItem,
  rest,
  restEstimate,
  salvage,
  selectSiteStrategy,
  useItem,
  updatePlayerSettings,
  startCombatFromEncounterSite,
  startExploration,
  travelToZone,
  unequip,
  type AchievementsResponse,
  type PlayerSettings,
  type WorldEventResponse,
} from '@/lib/api';
import { getSocket } from '@/lib/socket';

export type Screen =
  | 'home'
  | 'explore'
  | 'inventory'
  | 'combat'
  | 'settings'
  | 'skills'
  | 'equipment'
  | 'zones'
  | 'bestiary'
  | 'crafting'
  | 'forge'
  | 'gathering'
  | 'rest'
  | 'arena'
  | 'worldEvents'
  | 'achievements'
  | 'leaderboard'
  | 'admin';

export interface PendingEncounter {
  encounterSiteId: string;
  zoneId: string;
  zoneName: string;
  mobFamilyId: string;
  mobFamilyName: string;
  siteName: string;
  size: string;
  totalMobs: number;
  aliveMobs: number;
  defeatedMobs: number;
  decayedMobs: number;
  nextMobTemplateId: string | null;
  nextMobName: string | null;
  nextMobPrefix: string | null;
  nextMobDisplayName: string | null;
  discoveredAt: string;
  clearStrategy: string | null;
  currentRoom: number;
  totalRooms: number;
  roomMobCounts: Array<{ room: number; alive: number; total: number }>;
}

export interface LastCombatLogEntry {
  round: number;
  actor: 'combatantA' | 'combatantB';
  actorName?: string;
  action: string;
  message: string;
  roll?: number;
  damage?: number;
  evaded?: boolean;
  attackModifier?: number;
  accuracyModifier?: number;
  targetDodge?: number;
  targetEvasion?: number;
  targetDefence?: number;
  targetMagicDefence?: number;
  rawDamage?: number;
  armorReduction?: number;
  magicDefenceReduction?: number;
  isCritical?: boolean;
  critMultiplier?: number;
  combatantAHpAfter?: number;
  combatantBHpAfter?: number;
  spellName?: string;
  healAmount?: number;
  effectsApplied?: Array<{
    stat: string;
    modifier: number;
    duration: number;
    target: 'combatantA' | 'combatantB';
  }>;
  effectsExpired?: Array<{
    name: string;
    target: 'combatantA' | 'combatantB';
  }>;
}

export interface LastCombat {
  mobTemplateId: string;
  mobPrefix: string | null;
  mobName: string;
  mobDisplayName: string;
  outcome: string;
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  log: LastCombatLogEntry[];
  rewards: {
    xp: number;
    loot: Array<{
      itemTemplateId: string;
      quantity: number;
      rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      itemName?: string | null;
    }>;
    siteCompletion?: {
      chestRarity: 'common' | 'uncommon' | 'rare';
      materialRolls: number;
      loot: Array<{
        itemTemplateId: string;
        quantity: number;
        rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        itemName?: string | null;
      }>;
      recipeUnlocked: {
        recipeId: string;
        resultTemplateId: string;
        recipeName: string;
        soulbound: boolean;
      } | null;
      fullClearBonus?: boolean;
    } | null;
    skillXp: {
      skillType: string;
      xpGained: number;
      xpAfterEfficiency: number;
      efficiency: number;
      leveledUp: boolean;
      newLevel: number;
      characterXpGain: number;
      characterXpAfter: number;
      characterLevelBefore: number;
      characterLevelAfter: number;
      attributePointsAfter: number;
      characterLeveledUp: boolean;
    } | null;
  };
}

export type ActivityLogEntry = {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'danger' | 'warning';
};

export interface CharacterProgression {
  characterXp: number;
  characterLevel: number;
  attributePoints: number;
  attributes: {
    vitality: number;
    strength: number;
    dexterity: number;
    intelligence: number;
    luck: number;
    evasion: number;
  };
}

type AttributeType = keyof CharacterProgression['attributes'];

const DEFAULT_CHARACTER_PROGRESSION: CharacterProgression = {
  characterXp: 0,
  characterLevel: 1,
  attributePoints: 0,
  attributes: {
    vitality: 0,
    strength: 0,
    dexterity: 0,
    intelligence: 0,
    luck: 0,
    evasion: 0,
  },
};

export interface HpState {
  currentHp: number;
  maxHp: number;
  regenPerSecond: number;
  isRecovering: boolean;
  recoveryCost: number | null;
}

const GATHERING_PAGE_SIZE = 8;
const PENDING_ENCOUNTER_PAGE_SIZE = 8;

export function useGameController({ isAuthenticated }: { isAuthenticated: boolean }) {
  const [activeScreen, setActiveScreen] = useState<Screen>('home');
  const [turns, setTurns] = useState(0);
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
    };
  }>>([]);
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
  const [activeCraftingSkill, setActiveCraftingSkill] = useState<'refining' | 'tanning' | 'weaving' | 'weaponsmithing' | 'armorsmithing' | 'leatherworking' | 'tailoring' | 'alchemy'>('weaponsmithing');
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
  const [achievementData, setAchievementData] = useState<AchievementsResponse | null>(null);
  const [achievementUnclaimedCount, setAchievementUnclaimedCount] = useState(0);
  const [activeTitle, setActiveTitleState] = useState<string | null>(null);
  const [playbackActive, setPlaybackActive] = useState(false);
  const [combatPlaybackQueue, setCombatPlaybackQueue] = useState<Array<{
    mobName: string;
    mobDisplayName: string;
    mobTemplateId: string;
    mobPrefix: string | null;
    outcome: string;
    combatantAMaxHp: number;
    playerStartHp: number;
    combatantBMaxHp: number;
    log: LastCombatLogEntry[];
    rewards: LastCombat['rewards'];
  }> | null>(null);
  const [combatPlaybackIndex, setCombatPlaybackIndex] = useState(0);
  const pendingCombatRewardsRef = useRef<LastCombat['rewards'] | null>(null);
  const siteJustClearedRef = useRef(false);
  const arrivedInTownRef = useRef(false);
  const combatPlaybackData = combatPlaybackQueue?.[combatPlaybackIndex] ?? null;
  const [explorationPlaybackData, setExplorationPlaybackData] = useState<{
    totalTurns: number;
    zoneName: string;
    events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
    aborted: boolean;
    refundedTurns: number;
    playerHpBeforeExploration: number;
    playerMaxHp: number;
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
  } | null>(null);

  const loadTurnsAndHp = useCallback(async () => {
    const [turnRes, hpRes] = await Promise.all([getTurns(), getHpState()]);
    if (turnRes.data) setTurns(turnRes.data.currentTurns);
    if (hpRes.data) setHpState(hpRes.data);
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

  const loadAll = useCallback(async () => {
    setActionError(null);

    const [turnRes, playerRes, skillsRes, zonesRes, invRes, equipRes, recipesRes, hpRes] = await Promise.all([
      getTurns(),
      getPlayer(),
      getSkills(),
      getZones(),
      getInventory(),
      getEquipment(),
      getCraftingRecipes(),
      getHpState(),
    ]);

    if (turnRes.data) setTurns(turnRes.data.currentTurns);
    if (playerRes.data) {
      setCharacterProgression({
        characterXp: playerRes.data.player.characterXp,
        characterLevel: playerRes.data.player.characterLevel,
        attributePoints: playerRes.data.player.attributePoints,
        attributes: playerRes.data.player.attributes,
      });
      setAutoPotionThreshold(playerRes.data.player.autoPotionThreshold ?? 0);
      setTutorialStep(playerRes.data.player.tutorialStep ?? TUTORIAL_COMPLETED);
      setCombatLogSpeedMs(playerRes.data.player.combatLogSpeedMs ?? 800);
      setExplorationSpeedMs(playerRes.data.player.explorationSpeedMs ?? 800);
      setAutoSkipKnownCombat(playerRes.data.player.autoSkipKnownCombat ?? false);
      setDefaultExploreTurns(playerRes.data.player.defaultExploreTurns ?? 100);
      setQuickRestHealPercent(playerRes.data.player.quickRestHealPercent ?? 100);
      setDefaultRefiningMax(playerRes.data.player.defaultRefiningMax ?? false);
    }
    if (skillsRes.data) setSkills(skillsRes.data.skills);
    if (hpRes.data) setHpState(hpRes.data);
    if (zonesRes.data) {
      setZones(zonesRes.data.zones);
      setZoneConnections(zonesRes.data.connections);
      setActiveZoneId(zonesRes.data.currentZoneId);
      if (zonesRes.data.currentZoneId) {
        getZoneEvents(zonesRes.data.currentZoneId).then((res) => {
          if (res.data) setActiveEvents(res.data.events);
        });
      }
    }
    if (invRes.data) setInventory(invRes.data.items);
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
    if (['home', 'skills', 'zones', 'bestiary', 'rest', 'worldEvents', 'achievements', 'leaderboard', 'admin'].includes(activeScreen)) return 'home';
    if (['explore', 'gathering', 'crafting', 'forge'].includes(activeScreen)) return 'explore';
    if (['inventory', 'equipment'].includes(activeScreen)) return 'inventory';
    if (['combat', 'arena'].includes(activeScreen)) return 'combat';
    return 'settings';
  };

  const nowStamp = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const pushLog = (...entries: ActivityLogEntry[]) => {
    setActivityLog((prev) => [...entries, ...prev].slice(0, 100));
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

  const PERCENT_STATS = new Set(['critChance', 'critDamage']);
  const formatStatName = (stat: string) => {
    if (stat === 'magicDefence') return 'Magic Defence';
    if (stat === 'critChance') return 'Crit Chance';
    if (stat === 'critDamage') return 'Crit Damage';
    return stat
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (char) => char.toUpperCase())
      .trim();
  };
  const formatStatValue = (stat: string, value: number) =>
    PERCENT_STATS.has(stat) ? `${Math.round(value * 100)}%` : String(value);

  const currentZone =
    zones.find((z) => z.id === activeZoneId) ??
    zones.find((z) => z.discovered) ??
    zones.find((z) => z.isStarter) ??
    null;

  const ownedByTemplateId = (() => {
    const map = new Map<string, number>();
    for (const item of inventory) {
      map.set(item.template.id, (map.get(item.template.id) ?? 0) + item.quantity);
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

  const handleStartExploration = async (turnSpend: number) => {
    if (!currentZone) return;

    await runAction('exploration', async () => {
      const hpBefore = hpState.currentHp;
      const maxHpBefore = hpState.maxHp;
      const res = await startExploration(currentZone.id, turnSpend);
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
    setExplorationPlaybackData(null);
    setPlaybackActive(false);
    advanceTutorial(TUTORIAL_STEP_EXPLORE);
    await loadAll();
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
    setExplorationPlaybackData(null);
    setPlaybackActive(false);
    advanceTutorial(TUTORIAL_STEP_EXPLORE);
    await loadAll();
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
        const queue = data.combat.fights.map((fight) => ({
          mobName: fight.mobName ?? data.combat.mobName,
          mobDisplayName: fight.mobDisplayName,
          mobTemplateId: fight.mobTemplateId,
          mobPrefix: fight.mobPrefix,
          outcome: fight.outcome,
          combatantAMaxHp: fight.playerMaxHp,
          playerStartHp: fight.playerStartHp,
          combatantBMaxHp: fight.mobMaxHp,
          log: fight.log as LastCombatLogEntry[],
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
        }));
        pendingCombatRewardsRef.current = rewards;
        setCombatPlaybackQueue(queue);
        setCombatPlaybackIndex(0);
      } else {
        setCombatPlaybackQueue([{
          mobName: data.combat.mobName,
          mobDisplayName: data.combat.mobDisplayName,
          mobTemplateId: data.combat.mobTemplateId,
          mobPrefix: data.combat.mobPrefix,
          outcome: data.combat.outcome,
          combatantAMaxHp: data.combat.playerMaxHp,
          playerStartHp: hpBefore,
          combatantBMaxHp: data.combat.mobMaxHp,
          log: data.combat.log,
          rewards,
        }]);
        setCombatPlaybackIndex(0);
        pendingCombatRewardsRef.current = rewards;
      }
      setPlaybackActive(true);

      if (data.rewards.siteCompletion) {
        siteJustClearedRef.current = true;
      }

      if (data.activeEvents?.length) {
        for (const evt of data.activeEvents) {
          const sign = evt.effectType.endsWith('_down') ? '-' : '+';
          pushLog({ timestamp: nowStamp(), type: 'info', message: `World event active: ${evt.title} (${sign}${Math.round(evt.effectValue * 100)}%)` });
        }
      }

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

      await Promise.all([loadAll(), loadTurnsAndHp(), refreshPendingEncounters(), loadBestiary()]);
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
      // More fights in the queue — advance to next
      setCombatPlaybackIndex(combatPlaybackIndex + 1);
      return;
    }

    // All fights done — finalize lastCombat with aggregated rewards
    const lastFight = combatPlaybackQueue?.[combatPlaybackQueue.length - 1];
    if (lastFight) {
      const aggregatedRewards = pendingCombatRewardsRef.current ?? lastFight.rewards;
      setLastCombat({
        mobTemplateId: lastFight.mobTemplateId,
        mobPrefix: lastFight.mobPrefix,
        mobName: lastFight.mobName,
        mobDisplayName: lastFight.mobDisplayName,
        outcome: lastFight.outcome,
        combatantAMaxHp: lastFight.combatantAMaxHp,
        combatantBMaxHp: lastFight.combatantBMaxHp,
        log: lastFight.log,
        rewards: aggregatedRewards,
      });
    }
    setCombatPlaybackQueue(null);
    setCombatPlaybackIndex(0);
    pendingCombatRewardsRef.current = null;
    setPlaybackActive(false);

    if (siteJustClearedRef.current) {
      siteJustClearedRef.current = false;
      advanceTutorial(TUTORIAL_STEP_COMBAT);
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
          setLastCombat({
            mobTemplateId: '',
            mobPrefix: null,
            mobName: lastFight.mobName,
            mobDisplayName: lastFight.mobDisplayName,
            outcome: lastFight.outcome,
            combatantAMaxHp: lastFight.combatantAMaxHp,
            combatantBMaxHp: lastFight.combatantBMaxHp,
            log: lastFight.log,
            rewards: aggregatedRewards,
          });
        }
        setCombatPlaybackQueue(null);
        setCombatPlaybackIndex(0);
        pendingCombatRewardsRef.current = null;
      }
      if (travelPlaybackData) {
        handleTravelPlaybackSkip();
      }
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

      if (data.activeEvents?.length) {
        for (const evt of data.activeEvents) {
          const sign = evt.effectType.endsWith('_down') ? '-' : '+';
          newLogs.push({ timestamp: nowStamp(), type: 'info', message: `World event active: ${evt.title} (${sign}${Math.round(evt.effectValue * 100)}%)` });
        }
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
            message: `Critical${rarityLabel} craft! +${formatStatValue(stat, value)} ${formatStatName(stat)}.`,
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

  const handleTravelToZone = async (id: string) => {
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
    setTravelPlaybackData(null);
    setPlaybackActive(false);
    await loadAll();

    if (arrivedInTownRef.current) {
      arrivedInTownRef.current = false;
      advanceTutorial(TUTORIAL_STEP_TRAVEL);
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
    setTravelPlaybackData(null);
    setPlaybackActive(false);
    await loadAll();

    if (arrivedInTownRef.current) {
      arrivedInTownRef.current = false;
      advanceTutorial(TUTORIAL_STEP_TRAVEL);
    }
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

  return {
    // Navigation
    activeScreen,
    setActiveScreen,
    handleNavigate,
    getActiveTab,
    handleTravelToZone,

    // Core state
    turns,
    setTurns,
    zones,
    activeZoneId,
    setActiveZoneId,
    zoneConnections,
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
    playbackActive,
    combatPlaybackData,
    combatPlaybackQueue,
    combatPlaybackIndex,
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
    handleForgeUpgrade,
    handleForgeReroll,
    handleDestroyItem,
    handleRepairItem,
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
  };
}

