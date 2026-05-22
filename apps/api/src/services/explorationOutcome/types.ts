import type {
  CombatPotion,
  CombatTemplateSlotData,
  PerActionScaling,
  PotionConsumed,
  QuestProgressUpdate,
  WorldEventData,
} from '@pocketrealm/shared';
import type { AttackSkill } from '../combatStatsService';
import type { PlayerProgressionState } from '../attributesService';
import type { EquipmentStats } from '../equipmentService';
import type { PlayerGuildModifiers } from '../guildUpgradeService';
import type { GrantXpResult } from '../xpService';
import type { NarrativeEvent, PendingAmbushCombatLog, PendingEncounterSiteDiscovery, PendingResourceDiscovery, ZoneFamilyRow } from '../exploration/helpers';
import type { computeZoneModifiers } from '../worldEventService';

export interface ExplorationOutcomeContext {
  playerId: string;
  username: string;
  zoneId: string;
  zone: { id: string; name: string; difficulty: number };
  hpState: { currentHp: number; maxHp: number };
  combatPrep: {
    attackSkill: AttackSkill;
    attackLevel: number;
    guildMods: PlayerGuildModifiers;
    perActionScaling: PerActionScaling;
    playerTemplate: CombatTemplateSlotData[];
    potionPool: CombatPotion[];
    resources: {
      stamina: number;
      maxStamina: number;
      staminaRegenPerRound: number;
      mana: number;
      maxMana: number;
      manaRegenPerRound: number;
    };
    unlockedActions: string[];
  };
  combatBuffs: { damageBoost: number; defenceBoost: number; durabilityShield: number };
  buffUsesLeft: { damage: number; defence: number; durability: number };
  progression: PlayerProgressionState;
  equipmentStats: EquipmentStats;
  mobTemplates: unknown[];
  zoneFamilies: ZoneFamilyRow[];
  zoneTiers: Record<string, number> | null;
  selectedTier: number;
  explorationProgress: { percent: number; turnsExplored: number; turnsToExplore: number | null };
  zoneModifiers: ReturnType<typeof computeZoneModifiers>;
  spawnMods: {
    global: number;
    byFamily: Map<string, number>;
  };
  mobToFamilyMap: Map<string, string>;
  trackingFamilyId: string | null;
  prospectingResourceNodeId: string | null;
  prospectingSkillLevel: number | null;
  cachedZoneEvents: WorldEventData[];
  cachedWorldEvents: WorldEventData[];
  isTutorialExplore: boolean;
  resourceNodes: Array<{
    id: string;
    discoveryWeight: number;
    resourceType: string;
    skillRequired: string;
    levelRequired: number;
    minCapacity: number;
    maxCapacity: number;
  }>;
  undiscoveredNeighbors: Array<{ id: string; name: string }>;
  thresholdByToId: Map<string, number>;
}

export interface ExplorationOutcomeResult {
  events: NarrativeEvent[];
  pendingResources: PendingResourceDiscovery[];
  pendingSites: PendingEncounterSiteDiscovery[];
  pendingCombatLogs: PendingAmbushCombatLog[];
  pendingCacheLoot: Array<{ turnOccurred: number; mobFamilyId: string }>;
  hiddenCaches: Array<{
    turnOccurred: number;
    loot?: Array<{ itemTemplateId: string; name: string; quantity: number }>;
    soulboundItem?: { itemTemplateId: string; name: string; rarity: string } | null;
  }>;
  allPotionsConsumed: PotionConsumed[];
  ambushPendingLootSessionIds: string[];
  allNewItemIds: string[];
  allUpdatedItemIds: string[];
  allQuestProgress: QuestProgressUpdate[];
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  aborted: boolean;
  abortedAtTurn: number | null;
  wasKnockedOut: boolean;
  respawnedTo: { townId: string; townName: string } | null;
  zoneExitDiscovered: boolean;
}

export interface ExplorationTurnOutcome {
  turnOccurred: number;
  type: string;
}

export interface AmbushProcessingResult {
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  aborted: boolean;
  abortedAtTurn: number | null;
  wasKnockedOut: boolean;
  respawnedTo: { townId: string; townName: string } | null;
}
