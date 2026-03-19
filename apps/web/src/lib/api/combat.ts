import type { QuestProgressUpdate, StateUpdates, BossActiveEffect, ExpeditionRoundLog } from '@pocketrealm/shared';
import { fetchApi, type TurnStateResponse, type TaxInfo } from './core';
import type { CombatAction } from '@pocketrealm/shared';

// Shared event modifier types
export interface EventModifierBadge {
  title: string;
  effectType: string;
  effectValue: number;
  isGlobal: boolean;
}

export interface CombatActiveEvent {
  title: string;
  effectType: string;
  effectValue: number;
  appliedToThisMob?: boolean;
}

// Zones

export async function getZones() {
  return fetchApi<{
    zones: Array<{
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
      exploration: {
        turnsExplored: number;
        turnsToExplore: number | null;
        percent: number;
        tiers: Record<string, number> | null;
      } | null;
    }>;
    connections: Array<{ fromId: string; toId: string; explorationThreshold: number }>;
    undiscoveredZones: Array<{ id: string; name: string; explorationThreshold: number; fromZoneId: string; discovered: false }>;
    currentZoneId: string;
  }>('/api/v1/zones');
}

export async function travelToZone(zoneId: string) {
  return fetchApi<{
    zone: { id: string; name: string; zoneType: string };
    turns: TurnStateResponse;
    travelCost: number;
    breadcrumbReturn: boolean;
    events: Array<{
      turn: number;
      type: string;
      description: string;
      details?: Record<string, unknown>;
    }>;
    aborted: boolean;
    refundedTurns: number;
    respawnedTo: { townId: string; townName: string } | null;
    newDiscoveries: Array<{ id: string; name: string }>;
    tax: TaxInfo | null;
    pendingLootSessionId?: string;
    stateUpdates?: StateUpdates;
  }>('/api/v1/zones/travel', {
    method: 'POST',
    body: JSON.stringify({ zoneId }),
  });
}

// Exploration

export async function estimateExploration(turns: number) {
  return fetchApi<{
    estimate: {
      turns: number;
      ambushChance: number;
      encounterSiteChance: number;
      resourceNodeChance: number;
      hiddenCacheChance: number;
      expectedAmbushes: number;
      expectedEncounterSites: number;
    };
    taxRate: number;
    effectiveTurns: number;
  }>(`/api/v1/exploration/estimate?turns=${turns}`);
}

export async function startExploration(zoneId: string, turns: number, tier?: number) {
  return fetchApi<{
    logId: string;
    zone: { id: string; name: string; difficulty: number };
    turns: TurnStateResponse;
    aborted: boolean;
    refundedTurns: number;
    events: Array<{
      turn: number;
      type: string;
      description: string;
      details?: Record<string, unknown>;
    }>;
    encounterSites: Array<{
      turnOccurred: number;
      encounterSiteId: string;
      mobFamilyId: string;
      siteName: string;
      size: 'small' | 'medium' | 'large';
      totalMobs: number;
      discoveredAt: string;
    }>;
    resourceDiscoveries: Array<{
      turnOccurred: number;
      playerNodeId: string;
      resourceNodeId: string;
      resourceType: string;
      capacity: number;
      sizeName: string;
    }>;
    hiddenCaches: Array<{
      turnOccurred: number;
      loot?: Array<{ itemTemplateId: string; name: string; quantity: number }>;
      soulboundItem?: { itemTemplateId: string; name: string; rarity: string } | null;
    }>;
    zoneExitDiscovered: boolean;
    explorationProgress: {
      turnsExplored: number;
      percent: number;
      turnsToExplore: number | null;
    };
    pendingLootSessionIds?: string[];
    tax: TaxInfo | null;
    questProgress?: QuestProgressUpdate[];
    stateUpdates?: StateUpdates;
  }>('/api/v1/exploration/start', {
    method: 'POST',
    body: JSON.stringify({ zoneId, turns, ...(tier !== undefined && { tier }) }),
  });
}

// Combat types

export interface CombatLogEntryResponse {
  round: number;
  actor: 'combatantA' | 'combatantB';
  actorName?: string;
  action: CombatAction;
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
  combatantAStaminaAfter?: number;
  combatantBStaminaAfter?: number;
  combatantAManaAfter?: number;
  combatantBManaAfter?: number;
  spellName?: string;
  healAmount?: number;
  healResourceType?: 'hp' | 'stamina' | 'mana';
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
  actionId?: string;
  actionName?: string;
  wasExhausted?: boolean;
  staminaAfter?: number;
  manaAfter?: number;
  staminaCost?: number;
  manaCost?: number;
  interactionResult?: string;  // 'countered' | 'warded' | 'defended' | null
  hitChance?: number;
  hitRollValue?: number;
  attackerHitScore?: number;
  defenderAvoidScore?: number;
}

export interface SkillXpGrantResponse {
  skillType: string;
  xpGained: number;
  xpAfterEfficiency: number;
  efficiency: number;
  leveledUp: boolean;
  newLevel: number;
  atDailyCap: boolean;
  newTotalXp: number;
  newDailyXpGained: number;
  characterXpGain: number;
  characterXpAfter: number;
  characterLevelBefore: number;
  characterLevelAfter: number;
  attributePointsAfter: number;
  characterLeveledUp: boolean;
}

export type CombatOutcomeResponse = 'victory' | 'defeat' | 'fled' | 'draw';
export type CombatSourceResponse = 'zone_combat' | 'encounter_site' | 'exploration_ambush' | 'travel_ambush';

export interface CombatResultResponse {
  zoneId: string;
  zoneName: string;
  mobTemplateId: string;
  mobName: string;
  mobPrefix: string | null;
  mobDisplayName: string;
  source?: CombatSourceResponse | null;
  encounterSiteId: string | null;
  encounterSiteCleared?: boolean;
  attackSkill: 'melee' | 'ranged' | 'magic';
  outcome: CombatOutcomeResponse;
  playerMaxHp: number;
  playerStartStamina?: number;
  playerStartMana?: number;
  mobMaxHp: number;
  log: CombatLogEntryResponse[];
  eventModifiers?: EventModifierBadge[];
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
    } | null;
    durabilityLost: Array<{ itemId: string; amount: number; itemName?: string; newDurability?: number; maxDurability?: number; isBroken?: boolean; crossedWarningThreshold?: boolean }>;
    skillXpGrants: SkillXpGrantResponse[];
  };
}

export interface CombatFightResult {
  room?: number;
  mobName: string;
  mobDisplayName: string;
  mobTemplateId: string;
  mobPrefix: string | null;
  outcome: string;
  playerMaxHp: number;
  playerStartHp: number;
  playerStartStamina?: number;
  playerStartMana?: number;
  mobMaxHp: number;
  log?: CombatLogEntryResponse[];
  combatLogId?: string;
  playerHpRemaining: number;
  potionsConsumed: Array<{ tier: number; healAmount: number; round: number; templateId?: string }>;
  xp: number;
  loot: Array<{ itemTemplateId: string; quantity: number; rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; itemName?: string | null }>;
  durabilityLost: Array<{ itemId: string; amount: number; itemName?: string; newDurability?: number; maxDurability?: number; isBroken?: boolean; crossedWarningThreshold?: boolean }>;
  skillXpGrants: SkillXpGrantResponse[];
}

export interface CombatResponse {
  logId: string;
  turns: TurnStateResponse;
  combat: {
    zoneId: string;
    mobTemplateId: string;
    mobPrefix: string | null;
    mobName: string;
    mobDisplayName: string;
    encounterSiteId: string | null;
    encounterSiteCleared?: boolean;
    outcome: CombatOutcomeResponse;
    playerMaxHp: number;
    playerStartStamina?: number;
    playerStartMana?: number;
    mobMaxHp: number;
    log?: CombatLogEntryResponse[];
    combatLogId?: string;
    room?: {
      currentRoom: number;
      roomCleared: boolean;
      siteStrategy: string;
      fullClearActive: boolean;
    };
    fights?: CombatFightResult[];
  };
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
    durabilityLost: Array<{ itemId: string; amount: number; itemName?: string; newDurability?: number; maxDurability?: number; isBroken?: boolean; crossedWarningThreshold?: boolean }>;
    skillXpGrants: SkillXpGrantResponse[];
  };
  pendingLootSessionId?: string | null;
  pendingLootItems?: Array<{ templateName: string; rarity: string; quantity: number }>;
  activeEvents?: CombatActiveEvent[];
  explorationProgress?: {
    turnsExplored: number;
    percent: number;
    turnsToExplore: number | null;
  };
  questProgress?: QuestProgressUpdate[];
  stateUpdates?: StateUpdates;
}

export interface CombatHistoryListItemResponse {
  logId: string;
  createdAt: string;
  zoneId: string | null;
  zoneName: string | null;
  mobTemplateId: string | null;
  mobName: string | null;
  mobDisplayName: string | null;
  outcome: string | null;
  source: CombatSourceResponse | null;
  roundCount: number;
  xpGained: number;
  fightCount: number;
  encounterSiteId: string | null;
  mobFamilyName: string | null;
}

export interface EncounterSiteFightSummary {
  logId: string;
  createdAt: string;
  mobTemplateId: string | null;
  mobName: string | null;
  mobDisplayName: string | null;
  mobPrefix: string | null;
  outcome: string | null;
  room: number | null;
  xpGained: number;
}

export interface EncounterSiteFightsResponse {
  summaryLogId: string;
  fights: EncounterSiteFightSummary[];
}

export interface CombatHistoryResponse {
  logs: CombatHistoryListItemResponse[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  filters: {
    zones: Array<{ id: string; name: string }>;
    mobs: Array<{ id: string; name: string }>;
  };
}

export interface CombatHistoryQuery {
  page?: number;
  pageSize?: number;
  outcome?: CombatOutcomeResponse;
  zoneId?: string;
  mobTemplateId?: string;
  sort?: 'recent' | 'xp';
  search?: string;
}

// Combat functions

export async function startCombat(zoneId: string, attackSkill: 'melee' | 'ranged' | 'magic' = 'melee', mobTemplateId?: string) {
  return fetchApi<CombatResponse>('/api/v1/combat/start', {
    method: 'POST',
    body: JSON.stringify({ zoneId, attackSkill, ...(mobTemplateId ? { mobTemplateId } : {}) }),
  });
}

export async function startCombatFromEncounterSite(encounterSiteId: string, attackSkill: 'melee' | 'ranged' | 'magic' = 'melee') {
  return fetchApi<CombatResponse>('/api/v1/combat/start', {
    method: 'POST',
    body: JSON.stringify({ encounterSiteId, attackSkill }),
  });
}

export interface EncounterSitesQuery {
  page?: number;
  pageSize?: number;
  zoneId?: string;
  mobFamilyId?: string;
  sort?: 'recent' | 'danger';
}

export interface EncounterSitesResponse {
  encounterSites: Array<{
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
    eventModifiers?: EventModifierBadge[];
    totalTurnCost: number;
  }>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  filters: {
    zones: Array<{ id: string; name: string }>;
    mobFamilies: Array<{ id: string; name: string }>;
  };
}

export async function getEncounterSites(query: EncounterSitesQuery = {}) {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.zoneId) params.set('zoneId', query.zoneId);
  if (query.mobFamilyId) params.set('mobFamilyId', query.mobFamilyId);
  if (query.sort) params.set('sort', query.sort);

  const suffix = params.toString();
  return fetchApi<EncounterSitesResponse>(`/api/v1/combat/sites${suffix ? `?${suffix}` : ''}`);
}

export async function selectSiteStrategy(
  encounterSiteId: string,
  strategy: 'full_clear' | 'room_by_room'
) {
  return fetchApi<{ success: boolean; encounterSiteId: string; strategy: string }>(
    `/api/v1/combat/sites/${encounterSiteId}/strategy`,
    {
      method: 'POST',
      body: JSON.stringify({ strategy }),
    }
  );
}

export async function abandonEncounterSites(zoneId?: string) {
  return fetchApi<{ success: boolean; abandoned: number }>('/api/v1/combat/sites/abandon', {
    method: 'POST',
    body: JSON.stringify(zoneId ? { zoneId } : {}),
  });
}

// --- Encounter Site Room Combat Types ---

export interface EncounterRoomMobState {
  slot: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  activeEffects: BossActiveEffect[];
}

export interface EncounterPlayerState {
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  mana: number;
  maxMana: number;
  activeEffects: BossActiveEffect[];
}

export interface EncounterRoundSnapshot {
  roundNumber: number;
  log: ExpeditionRoundLog;
  mobStates: EncounterRoomMobState[];
  playerState: EncounterPlayerState;
}

export interface EncounterAutoResolveResponse {
  outcome: 'cleared' | 'defeated' | 'site_cleared';
  rounds: EncounterRoundSnapshot[];
  chestReward?: {
    rarity: string;
    materials: Array<{ itemTemplateId: string; name: string; quantity: number }>;
    recipe?: { recipeId: string; name: string } | null;
  };
  stateUpdates?: StateUpdates;
}

export interface EncounterStartRoomResponse {
  currentRoom: number;
  totalRooms: number;
  mobs: Array<{
    mobId: string;
    name: string;
    prefix: string | null;
    hp: number;
    maxHp: number;
    mobTemplateId: string;
  }>;
  playerState: EncounterPlayerState;
  stateUpdates?: StateUpdates;
}

export interface EncounterManualRoundResponse {
  roundNumber: number;
  roundLog: ExpeditionRoundLog;
  mobStates: EncounterRoomMobState[];
  playerState: EncounterPlayerState;
  outcome: 'ongoing' | 'cleared' | 'defeated' | 'site_cleared';
  siteCleared: boolean;
  chestReward?: EncounterAutoResolveResponse['chestReward'];
  completionRewards?: Record<string, unknown>;
  stateUpdates?: StateUpdates;
}

// --- Encounter Site Room Combat API Functions ---

export async function autoResolveEncounterRoom(siteId: string): Promise<EncounterAutoResolveResponse> {
  const res = await fetchApi<EncounterAutoResolveResponse>(`/api/v1/combat/sites/${siteId}/auto-resolve`, {
    method: 'POST',
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Auto-resolve failed');
  return res.data;
}

export async function startEncounterRoom(siteId: string): Promise<EncounterStartRoomResponse> {
  const res = await fetchApi<EncounterStartRoomResponse>(`/api/v1/combat/sites/${siteId}/start-room`, {
    method: 'POST',
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to start room');
  return res.data;
}

export async function resolveEncounterRound(
  siteId: string,
  action: { action: string; targetMobSlot?: number },
): Promise<EncounterManualRoundResponse> {
  const res = await fetchApi<EncounterManualRoundResponse>(`/api/v1/combat/sites/${siteId}/round`, {
    method: 'POST',
    body: JSON.stringify(action),
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to resolve round');
  return res.data;
}

export async function abandonEncounterSite(siteId: string): Promise<{ success: boolean; stateUpdates?: StateUpdates }> {
  const res = await fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>(`/api/v1/combat/sites/${siteId}/abandon`, {
    method: 'POST',
  });
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to abandon');
  return res.data;
}

export async function getCombatLog(id: string) {
  return fetchApi<{ logId: string; createdAt: string; combat: CombatResultResponse }>(`/api/v1/combat/logs/${id}`);
}

export async function getCombatLogs(query: CombatHistoryQuery = {}) {
  const params = new URLSearchParams();

  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.outcome) params.set('outcome', query.outcome);
  if (query.zoneId) params.set('zoneId', query.zoneId);
  if (query.mobTemplateId) params.set('mobTemplateId', query.mobTemplateId);
  if (query.sort) params.set('sort', query.sort);
  if (query.search) params.set('search', query.search);

  const suffix = params.toString();
  return fetchApi<CombatHistoryResponse>(`/api/v1/combat/logs${suffix ? `?${suffix}` : ''}`);
}

export async function getEncounterSiteFights(summaryLogId: string): Promise<EncounterSiteFightsResponse> {
  const res = await fetchApi<EncounterSiteFightsResponse>(`/api/v1/combat/logs/${summaryLogId}/fights`);
  if (!res.data) throw new Error(res.error?.message ?? 'Failed to fetch encounter site fights');
  return res.data;
}
