import { fetchApi, type TurnStateResponse, type TaxInfo } from './core';

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
    tax: TaxInfo | null;
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
  /** @deprecated Backward compat alias */
  playerHpAfter?: number;
  /** @deprecated Backward compat alias */
  mobHpAfter?: number;
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
  mobMaxHp: number;
  log: CombatLogEntryResponse[];
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
    skillXp: SkillXpGrantResponse | null;
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
  mobMaxHp: number;
  log?: CombatLogEntryResponse[];
  combatLogId?: string;
  playerHpRemaining: number;
  potionsConsumed: Array<{ tier: number; healAmount: number; round: number; templateId?: string }>;
  xp: number;
  loot: Array<{ itemTemplateId: string; quantity: number; rarity?: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'; itemName?: string | null }>;
  durabilityLost: Array<{ itemId: string; amount: number; itemName?: string; newDurability?: number; maxDurability?: number; isBroken?: boolean; crossedWarningThreshold?: boolean }>;
  skillXp: SkillXpGrantResponse | null;
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
    skillXp: SkillXpGrantResponse | null;
  };
  activeEvents?: CombatActiveEvent[];
  explorationProgress?: {
    turnsExplored: number;
    percent: number;
    turnsToExplore: number | null;
  };
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
