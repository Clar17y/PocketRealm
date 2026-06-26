import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { itemImageSrc } from '@/lib/assets';
import { getLatestVersion, CHANGELOG_STORAGE_KEY } from '@/lib/changelog';
import { RARITY_RANK } from '@/lib/rarity';
import {
  allocateSkillPoint,
  getCraftingRecipes,
  getGameBootstrap,
  getInventory,
  getSkillPointState,
  getTemplates,
  getZoneEvents,
  getZones,
  respecSkillPoints,
  updateTutorialStep,
  type SkillPointState,
  type WorldEventResponse,
  type ProspectableResourceNodeResponse,
} from '@/lib/api';
import { TUTORIAL_COMPLETED, TUTORIAL_STEP_SKILL_POINTS } from '@/lib/tutorial';
import type {
  CombatTemplateData,
  InventoryItemDTO,
  PlayerBuffData,
  ResourceState,
  SkillStateDTO,
} from '@pocketrealm/shared';
import type { CharacterProgression, HpState } from '../gameController.types';
import type { ServerSettingsPayload } from './usePlayerSettings';

type ZoneState = Array<{
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
}>;

type ZoneConnections = Array<{ fromId: string; toId: string; explorationThreshold: number }>;

type UndiscoveredZones = Array<{
  id: string;
  name: string;
  explorationThreshold: number;
  fromZoneId: string;
  discovered: false;
}>;

type EquipmentState = Array<{
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
}>;

type LootRevealItem = {
  name: string;
  rarity: InventoryItemDTO['rarity'];
  quantity: number;
  imageSrc?: string;
};

type InventoryResponseData = NonNullable<Awaited<ReturnType<typeof getInventory>>['data']>;

interface LoadedPlayerData extends ServerSettingsPayload, Record<string, unknown> {
  characterXp: number;
  characterLevel: number;
  attributePoints: number;
  attributes: CharacterProgression['attributes'];
  gold?: number | null;
  activeEncounterSiteId?: string | null;
  createdAt: string;
  tutorialStep?: number | null;
}

interface UseGameBootstrapOptions {
  tutorialStep: number;
  activeZoneIdRef: MutableRefObject<string | null>;
  playerCreatedAtRef: MutableRefObject<string | null>;
  hasLoadedOnceRef: MutableRefObject<boolean>;
  prevInventoryIdsRef: MutableRefObject<Set<string>>;
  lootRevealRarityRef: MutableRefObject<keyof typeof RARITY_RANK | 'none'>;
  initSettingsFromServer: (player: LoadedPlayerData) => void;
  setActionError: (message: string | null) => void;
  setTurns: (turns: number) => void;
  setCharacterProgression: (progression: CharacterProgression) => void;
  setGold: (gold: number) => void;
  setActiveEncounterSiteId: (encounterSiteId: string | null) => void;
  setTutorialStep: (step: number) => void;
  setShowChangelog: (show: boolean) => void;
  setSkills: (skills: SkillStateDTO[]) => void;
  setHpState: (state: HpState) => void;
  setStaminaState: (state: ResourceState) => void;
  setManaState: (state: ResourceState) => void;
  setSkillPointState: (state: SkillPointState | null) => void;
  setActiveBuffs: (buffs: PlayerBuffData[]) => void;
  setHasActiveExpedition: (active: boolean) => void;
  setZones: (zones: ZoneState) => void;
  setZoneConnections: (connections: ZoneConnections) => void;
  setUndiscoveredZones: (zones: UndiscoveredZones) => void;
  setActiveZoneId: (zoneId: string | null) => void;
  setActiveEvents: (events: WorldEventResponse[]) => void;
  setInventory: Dispatch<SetStateAction<InventoryItemDTO[]>>;
  setInventoryCapacity: (capacity: number) => void;
  setInventoryUsedSlots: (usedSlots: number) => void;
  setMaterialTotals: (totals: Record<string, number>) => void;
  setLootRevealItems: Dispatch<SetStateAction<LootRevealItem[] | null>>;
  setEquipment: (equipment: EquipmentState) => void;
  setCraftingRecipes: (recipes: Array<{
    id: string;
    skillType: string;
    requiredLevel: number;
    isAdvanced: boolean;
    isDiscovered: boolean;
    discoveryHint: string | null;
    soulbound: boolean;
    mobFamilyId: string | null;
    resultTemplate: {
      id: string;
      name: string;
      itemType: string;
      weightClass?: 'heavy' | 'medium' | 'light' | null;
      setId?: string | null;
      slot: string | null;
      tier: number;
      baseStats: Record<string, unknown>;
      stackable: boolean;
      maxDurability: number;
      requiredSkill: string | null;
      requiredLevel: number;
    };
    turnCost: number;
    materials: Array<{ templateId: string; quantity: number }>;
    materialTemplates: Array<{ id: string; name: string; itemType: string; stackable: boolean }>;
    xpReward: number;
  }>) => void;
  setZoneCraftingLevel: (level: number | null) => void;
  setZoneCraftingName: (name: string | null) => void;
  setTemplates: (templates: CombatTemplateData[]) => void;
  setGuildTaxRate: (rate: number) => void;
}

interface GameBootstrapPayload {
  turns: { currentTurns: number };
  player: { player: LoadedPlayerData };
  skills: { skills: SkillStateDTO[] };
  zones: {
    zones: ZoneState;
    connections: ZoneConnections;
    undiscoveredZones?: UndiscoveredZones;
    currentZoneId: string | null;
  };
  inventory: {
    items: InventoryItemDTO[];
    capacity: number;
    usedSlots: number;
    materialTotals?: Record<string, number>;
  };
  equipment: { equipment: EquipmentState };
  hp: HpState;
  resources: {
    stamina: ResourceState;
    mana: ResourceState;
  };
  skillPoints: SkillPointState;
  buffs: { buffs: PlayerBuffData[] };
  expeditionCooldowns: { hasActiveExpedition: boolean };
  zoneEvents: { events: WorldEventResponse[] };
  crafting: {
    recipes: Parameters<UseGameBootstrapOptions['setCraftingRecipes']>[0];
    zoneCraftingLevel: number | null;
    zoneName: string | null;
  };
  guild: { guild: { taxRate: number } } | null;
}

export function useGameBootstrap({
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
  setHpState,
  setStaminaState,
  setManaState,
  setSkillPointState,
  setActiveBuffs,
  setHasActiveExpedition,
  setZones,
  setZoneConnections,
  setUndiscoveredZones,
  setActiveZoneId,
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
}: UseGameBootstrapOptions) {
  const refreshCraftingRecipes = useCallback(async () => {
    const response = await getCraftingRecipes();
    if (response.data) {
      setCraftingRecipes(response.data.recipes);
      setZoneCraftingLevel(response.data.zoneCraftingLevel);
      setZoneCraftingName(response.data.zoneName);
    }
  }, [setCraftingRecipes, setZoneCraftingLevel, setZoneCraftingName]);

  const handleLoadSkillPoints = useCallback(async () => {
    const response = await getSkillPointState();
    if (response.data) {
      setSkillPointState(response.data);
    }
  }, [setSkillPointState]);

  const handleAllocateSkillPoint = useCallback(async (nodeId: string) => {
    const response = await allocateSkillPoint(nodeId);
    if (!response.data) return;

    setSkillPointState(response.data);

    if (tutorialStep === TUTORIAL_STEP_SKILL_POINTS && response.data.availablePoints === 0) {
      const nextResponse = await updateTutorialStep(TUTORIAL_STEP_SKILL_POINTS + 1);
      if (nextResponse.data) {
        setTutorialStep(nextResponse.data.tutorialStep);
      }
    }
  }, [setSkillPointState, setTutorialStep, tutorialStep]);

  const handleRespecSkillPoints = useCallback(async () => {
    const response = await respecSkillPoints();
    if (response.data) {
      setSkillPointState(response.data);
    }
  }, [setSkillPointState]);

  const handleLoadTemplates = useCallback(async () => {
    const response = await getTemplates();
    if (response.data) {
      setTemplates(response.data.templates);
    }
  }, [setTemplates]);

  const applyInventoryData = useCallback((data: InventoryResponseData) => {
    setInventory(data.items);
    setInventoryCapacity(data.capacity ?? 24);
    setInventoryUsedSlots(data.usedSlots ?? 0);

    if (data.materialTotals) {
      setMaterialTotals(data.materialTotals);
    }

    if (hasLoadedOnceRef.current && lootRevealRarityRef.current !== 'none') {
      const minRank = RARITY_RANK[lootRevealRarityRef.current] ?? 1;
      const notableItems = data.items.filter(
        (item) => !prevInventoryIdsRef.current.has(item.id) && RARITY_RANK[item.rarity] >= minRank,
      );

      if (notableItems.length > 0) {
        setLootRevealItems(
          notableItems.map((item) => ({
            name: item.template.name,
            rarity: item.rarity as LootRevealItem['rarity'],
            quantity: item.quantity,
            imageSrc: itemImageSrc(item.template.name, item.template.itemType),
          })),
        );
      }
    }

    prevInventoryIdsRef.current = new Set(data.items.map((item) => item.id));
    hasLoadedOnceRef.current = true;
  }, [
    hasLoadedOnceRef,
    lootRevealRarityRef,
    prevInventoryIdsRef,
    setInventory,
    setInventoryCapacity,
    setInventoryUsedSlots,
    setLootRevealItems,
    setMaterialTotals,
  ]);

  const refreshInventory = useCallback(async (): Promise<boolean> => {
    const response = await getInventory();
    if (!response.data) {
      return false;
    }

    applyInventoryData(response.data);
    return true;
  }, [applyInventoryData]);

  const applyZonesData = useCallback((data: {
    zones: ZoneState;
    connections: ZoneConnections;
    undiscoveredZones?: UndiscoveredZones;
    currentZoneId: string | null;
  }, options: { events?: WorldEventResponse[] } = {}) => {
    setZones(data.zones);
    setZoneConnections(data.connections);
    setUndiscoveredZones(data.undiscoveredZones ?? []);
    setActiveZoneId(data.currentZoneId);

    if (options.events) {
      setActiveEvents(options.events);
      return;
    }

    if (data.currentZoneId) {
      getZoneEvents(data.currentZoneId).then((response) => {
        if (response.data) {
          setActiveEvents(response.data.events);
        }
      });
    }
  }, [setActiveEvents, setActiveZoneId, setUndiscoveredZones, setZoneConnections, setZones]);

  const reloadZones = useCallback(async (options?: { expectedActiveZoneId?: string | null }) => {
    const response = await getZones({ fresh: true });
    if (!response.data) return;

    if (
      options
      && 'expectedActiveZoneId' in options
      && activeZoneIdRef.current !== options.expectedActiveZoneId
    ) {
      return;
    }

    applyZonesData(response.data);
  }, [activeZoneIdRef, applyZonesData]);

  const loadAll = useCallback(async () => {
    setActionError(null);

    const bootstrapResponse = await getGameBootstrap<GameBootstrapPayload>();
    if (!bootstrapResponse.data) {
      setActionError(bootstrapResponse.error?.message ?? 'Failed to load game state.');
      return;
    }
    const bootstrap = bootstrapResponse.data;

    setTurns(bootstrap.turns.currentTurns);

    const player = bootstrap.player.player;

    setCharacterProgression({
      characterXp: player.characterXp,
      characterLevel: player.characterLevel,
      attributePoints: player.attributePoints,
      attributes: player.attributes,
    });
    setGold(player.gold ?? 0);
    setActiveEncounterSiteId(player.activeEncounterSiteId ?? null);
    playerCreatedAtRef.current = player.createdAt;
    initSettingsFromServer(player);

    const serverTutorialStep = player.tutorialStep ?? TUTORIAL_COMPLETED;
    setTutorialStep(serverTutorialStep);

    const latestVersion = getLatestVersion();
    if (latestVersion && localStorage.getItem(CHANGELOG_STORAGE_KEY) !== latestVersion) {
      if (serverTutorialStep === 0) {
        localStorage.setItem(CHANGELOG_STORAGE_KEY, latestVersion);
      } else {
        setShowChangelog(true);
      }
    }

    setSkills(bootstrap.skills.skills);
    setHpState(bootstrap.hp);
    setStaminaState(bootstrap.resources.stamina);
    setManaState(bootstrap.resources.mana);
    setSkillPointState(bootstrap.skillPoints);
    setActiveBuffs(bootstrap.buffs.buffs);

    applyZonesData(bootstrap.zones, { events: bootstrap.zoneEvents.events });
    applyInventoryData(bootstrap.inventory);

    setEquipment(
      bootstrap.equipment.equipment.map((entry) => ({
        slot: entry.slot,
        itemId: entry.itemId,
        item: entry.item
          ? {
              id: entry.item.id,
              rarity: entry.item.rarity,
              currentDurability: entry.item.currentDurability,
              maxDurability: entry.item.maxDurability,
              bonusStats: entry.item.bonusStats ?? null,
              template: entry.item.template,
            }
          : null,
      })),
    );

    setCraftingRecipes(bootstrap.crafting.recipes);
    setZoneCraftingLevel(bootstrap.crafting.zoneCraftingLevel);
    setZoneCraftingName(bootstrap.crafting.zoneName);
    setHasActiveExpedition(bootstrap.expeditionCooldowns.hasActiveExpedition);
    setGuildTaxRate(bootstrap.guild?.guild.taxRate ?? 0);
  }, [
    applyZonesData,
    applyInventoryData,
    initSettingsFromServer,
    playerCreatedAtRef,
    setActionError,
    setActiveBuffs,
    setActiveEncounterSiteId,
    setCharacterProgression,
    setCraftingRecipes,
    setEquipment,
    setGold,
    setGuildTaxRate,
    setHasActiveExpedition,
    setHpState,
    setManaState,
    setSkillPointState,
    setSkills,
    setShowChangelog,
    setStaminaState,
    setTemplates,
    setTutorialStep,
    setTurns,
    setZoneCraftingLevel,
    setZoneCraftingName,
  ]);

  return {
    refreshCraftingRecipes,
    refreshInventory,
    handleLoadSkillPoints,
    handleAllocateSkillPoint,
    handleRespecSkillPoints,
    handleLoadTemplates,
    reloadZones,
    loadAll,
  };
}
