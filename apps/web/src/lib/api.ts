function resolveApiUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (!configured) {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
    return 'http://localhost:4000';
  }

  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(configured);
      const isConfiguredLoopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      const isRemoteClient = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
      if (isConfiguredLoopback && isRemoteClient) {
        const protocol = parsed.protocol || window.location.protocol;
        const port = parsed.port || '4000';
        return `${protocol}//${window.location.hostname}:${port}`;
      }
    } catch {
      // fall through to configured value
    }
  }

  return configured;
}

const API_URL = resolveApiUrl();

interface ApiResponse<T> {
  data?: T;
  error?: { message: string; code: string };
}

type RefreshOutcome =
  | { ok: true; accessToken: string; refreshToken: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'network' | 'bad_response' };

let refreshInFlight: Promise<RefreshOutcome> | null = null;

function clearStoredTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

function getJwtExpMs(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const payloadJson = atob(padded);
    const payload = JSON.parse(payloadJson) as { exp?: number };

    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

async function refreshTokens(): Promise<RefreshOutcome> {
  if (typeof window === 'undefined') return { ok: false, reason: 'missing' };

  const currentRefreshToken = localStorage.getItem('refreshToken');
  if (!currentRefreshToken) return { ok: false, reason: 'missing' };

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: currentRefreshToken }),
        });

        const json = (await res.json().catch(() => null)) as
          | { accessToken?: string; refreshToken?: string; error?: { message: string; code: string } }
          | null;

        if (!res.ok) {
          const code = json?.error?.code;
          const isInvalid = code === 'INVALID_TOKEN' || code === 'MISSING_TOKEN';
          return { ok: false, reason: isInvalid ? 'invalid' : 'network' } as const;
        }
        if (!json?.accessToken || !json.refreshToken) return { ok: false, reason: 'bad_response' };

        localStorage.setItem('accessToken', json.accessToken);
        localStorage.setItem('refreshToken', json.refreshToken);
        return { ok: true, accessToken: json.accessToken, refreshToken: json.refreshToken } as const;
      } catch {
        return { ok: false, reason: 'network' } as const;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  attempt = 0
): Promise<ApiResponse<T>> {
  const isAuthEndpoint = endpoint.startsWith('/api/v1/auth/');

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;

    if (!isAuthEndpoint && token) {
      const expMs = getJwtExpMs(token);
      const shouldRefreshSoon = typeof expMs === 'number' && expMs - Date.now() < 60_000;
      if (shouldRefreshSoon) {
        await refreshTokens();
      }
    }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  const latestToken = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : token;
  if (latestToken) {
    headers['Authorization'] = `Bearer ${latestToken}`;
  }

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: options.credentials ?? 'include',
    });

    const json = (await res.json().catch(() => null)) as
      | (T & { error?: { message: string; code: string } })
      | { error?: { message: string; code: string } }
      | null;

    if (!res.ok) {
      if (!isAuthEndpoint && res.status === 401 && attempt === 0) {
        const refreshed = await refreshTokens();
        if (refreshed?.ok) {
          return fetchApi<T>(endpoint, options, attempt + 1);
        }
        if (refreshed?.reason === 'invalid') clearStoredTokens();
      }

      const error = (json && 'error' in json ? json.error : undefined) || {
        message: 'Unknown error',
        code: 'UNKNOWN',
      };
      return { error };
    }

    if (!json) return { error: { message: 'Invalid server response', code: 'INVALID_RESPONSE' } };
    return { data: json as T };
  } catch (err) {
    return { error: { message: 'Network error', code: 'NETWORK_ERROR' } };
  }
}

// Auth
export async function register(username: string, email: string, password: string) {
  return fetchApi<{
    player: { id: string; username: string; email: string };
    accessToken: string;
    refreshToken: string;
  }>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password }),
  });
}

export async function login(email: string, password: string) {
  return fetchApi<{
    player: { id: string; username: string; email: string };
    accessToken: string;
    refreshToken: string;
  }>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function refreshToken(token: string) {
  return fetchApi<{ accessToken: string; refreshToken: string }>('/api/v1/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: token }),
  });
}

// Player
export async function getPlayer() {
  return fetchApi<{
    player: {
      id: string;
      username: string;
      email: string;
      createdAt: string;
      characterXp: number;
      characterLevel: number;
      attributePoints: number;
      autoPotionThreshold: number;
      attributes: {
        vitality: number;
        strength: number;
        dexterity: number;
        intelligence: number;
        luck: number;
        evasion: number;
      };
    };
  }>('/api/v1/player');
}

export async function updatePlayerSettings(settings: { autoPotionThreshold: number }) {
  return fetchApi<{ autoPotionThreshold: number }>('/api/v1/player/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function getPlayerAttributes() {
  return fetchApi<{
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
  }>('/api/v1/player/attributes');
}

export async function allocatePlayerAttribute(
  attribute: 'vitality' | 'strength' | 'dexterity' | 'intelligence' | 'luck' | 'evasion',
  points: number = 1
) {
  return fetchApi<{
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
  }>('/api/v1/player/attributes', {
    method: 'POST',
    body: JSON.stringify({ attribute, points }),
  });
}

export async function getSkills() {
  return fetchApi<{
    skills: Array<{
      skillType: string;
      level: number;
      xp: number;
      dailyXpGained: number;
    }>;
  }>('/api/v1/player/skills');
}

export async function getEquipment() {
  return fetchApi<{
    equipment: Array<{
      playerId: string;
      slot: string;
      itemId: string | null;
      item: null | {
        id: string;
        templateId: string;
        ownerId: string;
        rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
        currentDurability: number | null;
        maxDurability: number | null;
        quantity: number;
        bonusStats: Record<string, number> | null;
        createdAt: string;
        template: {
          id: string;
          name: string;
          itemType: string;
          weightClass: 'heavy' | 'medium' | 'light' | null;
          slot: string | null;
          tier: number;
          baseStats: Record<string, unknown>;
          requiredSkill: string | null;
          requiredLevel: number;
          maxDurability: number;
          stackable: boolean;
        };
      };
    }>;
  }>('/api/v1/player/equipment');
}

export async function getBestiary() {
  return fetchApi<{
    mobs: Array<{
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
    }>;
    prefixSummary: Array<{
      prefix: string;
      displayName: string;
      totalKills: number;
      discovered: boolean;
    }>;
  }>('/api/v1/bestiary');
}

// Turns
export async function getTurns() {
  return fetchApi<{
    currentTurns: number;
    timeToCapMs: number | null;
    lastRegenAt: string;
  }>('/api/v1/turns');
}

export async function spendTurns(amount: number, reason?: string) {
  return fetchApi<{
    previousTurns: number;
    spent: number;
    currentTurns: number;
  }>('/api/v1/turns/spend', {
    method: 'POST',
    body: JSON.stringify({ amount, reason }),
  });
}

// HP & Rest
export async function getHpState() {
  return fetchApi<{
    currentHp: number;
    maxHp: number;
    regenPerSecond: number;
    lastHpRegenAt: string;
    isRecovering: boolean;
    recoveryCost: number | null;
  }>('/api/v1/hp');
}

export async function restEstimate(turns: number) {
  return fetchApi<{
    isRecovering: boolean;
    recoveryCost?: number;
    recoveryExitHp?: number;
    currentHp?: number;
    maxHp?: number;
    healPerTurn?: number;
    turnsRequested?: number;
    turnsNeeded?: number;
    healAmount?: number;
    resultingHp?: number;
  }>(`/api/v1/hp/rest/estimate?turns=${turns}`);
}

export async function rest(turns: number) {
  return fetchApi<{
    previousHp: number;
    healedAmount: number;
    currentHp: number;
    maxHp: number;
    turnsSpent: number;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
  }>('/api/v1/hp/rest', {
    method: 'POST',
    body: JSON.stringify({ turns }),
  });
}

export async function recoverFromKnockout() {
  return fetchApi<{
    previousState: 'recovering';
    currentHp: number;
    maxHp: number;
    turnsSpent: number;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
  }>('/api/v1/hp/recover', {
    method: 'POST',
  });
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
    currentZoneId: string;
  }>('/api/v1/zones');
}

export async function travelToZone(zoneId: string) {
  return fetchApi<{
    zone: { id: string; name: string; zoneType: string };
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
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
  }>(`/api/v1/exploration/estimate?turns=${turns}`);
}

export async function startExploration(zoneId: string, turns: number) {
  return fetchApi<{
    logId: string;
    zone: { id: string; name: string; difficulty: number };
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
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
    hiddenCaches: Array<{ turnOccurred: number }>;
    zoneExitDiscovered: boolean;
    explorationProgress: {
      turnsExplored: number;
      percent: number;
      turnsToExplore: number | null;
    };
  }>('/api/v1/exploration/start', {
    method: 'POST',
    body: JSON.stringify({ zoneId, turns }),
  });
}

// Combat

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
  mobName: string;
  mobDisplayName: string;
  mobTemplateId: string;
  mobPrefix: string | null;
  outcome: string;
  playerMaxHp: number;
  playerStartHp: number;
  mobMaxHp: number;
  log: CombatLogEntryResponse[];
  playerHpRemaining: number;
  potionsConsumed: Array<{ tier: number; healAmount: number; round: number; templateId?: string }>;
  xp: number;
  loot: Array<{ itemTemplateId: string; quantity: number; rarity?: string; itemName?: string | null }>;
  durabilityLost: Array<{ itemId: string; amount: number; itemName?: string; newDurability?: number; maxDurability?: number; isBroken?: boolean; crossedWarningThreshold?: boolean }>;
  skillXp: SkillXpGrantResponse | null;
}

export interface CombatResponse {
  logId: string;
  turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
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
    log: CombatLogEntryResponse[];
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
  activeEvents?: Array<{ title: string; effectType: string; effectValue: number }>;
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

// Inventory & Equipment
export async function getInventory() {
  return fetchApi<{
    items: Array<{
      id: string;
      templateId: string;
      ownerId: string;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      currentDurability: number | null;
      maxDurability: number | null;
      quantity: number;
      bonusStats: Record<string, number> | null;
      createdAt: string;
        template: {
          id: string;
          name: string;
          itemType: string;
          weightClass: 'heavy' | 'medium' | 'light' | null;
          slot: string | null;
          tier: number;
          baseStats: Record<string, unknown>;
        requiredSkill: string | null;
        requiredLevel: number;
        maxDurability: number;
        stackable: boolean;
      };
      equippedSlot: string | null;
    }>;
  }>('/api/v1/inventory');
}

export async function destroyInventoryItem(id: string, quantity?: number) {
  const q = quantity ? `?quantity=${quantity}` : '';
  return fetchApi<{ destroyed: boolean; itemId: string; remainingQuantity?: number }>(`/api/v1/inventory/${id}${q}`, {
    method: 'DELETE',
  });
}

export async function useItem(itemId: string) {
  return fetchApi<{
    itemName: string;
    previousHp: number;
    currentHp: number;
    maxHp: number;
    healedAmount: number;
    remainingQuantity: number | null;
  }>('/api/v1/inventory/use', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export async function repairItem(itemId: string) {
  return fetchApi<{
    repaired: boolean;
    turns?: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
    itemId: string;
    currentDurability: number | null;
    maxDurability: number | null;
    maxDurabilityDecay?: number;
  }>('/api/v1/inventory/repair', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export async function equip(itemId: string, slot: string) {
  return fetchApi<{ success: true }>('/api/v1/equipment/equip', {
    method: 'POST',
    body: JSON.stringify({ itemId, slot }),
  });
}

export async function unequip(slot: string) {
  return fetchApi<{ success: true }>('/api/v1/equipment/unequip', {
    method: 'POST',
    body: JSON.stringify({ slot }),
  });
}

// Gathering & Crafting
export async function mine(playerNodeId: string, turns: number, currentZoneId: string) {
  return fetchApi<{
    logId: string;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
    node: {
      id: string;
      templateId: string;
      zoneId: string;
      zoneName: string;
      resourceType: string;
      levelRequired: number;
      remainingCapacity: number;
      nodeDepleted: boolean;
    };
    results: { actions: number; baseYield: number; yieldMultiplier: number; totalYield: number; itemTemplateId: string; itemId: string };
    xp: {
      skillType: string;
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
    };
    activeEvents?: Array<{ title: string; effectType: string; effectValue: number }>;
  }>('/api/v1/gathering/mine', {
    method: 'POST',
    body: JSON.stringify({ playerNodeId, turns, currentZoneId }),
  });
}

export async function getCraftingRecipes() {
  return fetchApi<{
    recipes: Array<{
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
        weightClass: 'heavy' | 'medium' | 'light' | null;
        setId: string | null;
        slot: string | null;
        tier: number;
        baseStats: Record<string, unknown>;
        requiredSkill: string | null;
        requiredLevel: number;
        maxDurability: number;
        stackable: boolean;
      };
      turnCost: number;
      materials: Array<{ templateId: string; quantity: number }>;
      materialTemplates: Array<{ id: string; name: string; itemType: string; stackable: boolean }>;
      xpReward: number;
    }>;
    zoneCraftingLevel: number | null;
    zoneName: string | null;
  }>('/api/v1/crafting/recipes');
}

export async function craft(recipeId: string, quantity: number = 1) {
  return fetchApi<{
    logId: string;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
    crafted: { recipeId: string; resultTemplateId: string; quantity: number; craftedItemIds: string[] };
    craftedItemDetails: Array<{
      id: string;
      isCrit: boolean;
      rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      bonusStats?: Record<string, number>;
    }>;
    xp: {
      skillType: string;
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
    };
  }>('/api/v1/crafting/craft', {
    method: 'POST',
    body: JSON.stringify({ recipeId, quantity }),
  });
}

export async function salvage(itemId: string) {
  return fetchApi<{
    logId: string;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
    salvage: {
      salvagedItemId: string;
      salvagedTemplateId: string;
      returnedMaterials: Array<{ templateId: string; name: string; quantity: number }>;
    };
  }>('/api/v1/crafting/salvage', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}

export async function forgeUpgrade(itemId: string, sacrificialItemId: string) {
  return fetchApi<{
    logId: string;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
    forge: {
      action: 'upgrade';
      success: boolean;
      destroyed: boolean;
      itemId: string;
      fromRarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
      toRarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
      successChance: number;
      roll: number;
      sacrificialItemId: string;
      bonusStats?: Record<string, number> | null;
    };
  }>('/api/v1/crafting/forge/upgrade', {
    method: 'POST',
    body: JSON.stringify({ itemId, sacrificialItemId }),
  });
}

export async function forgeReroll(itemId: string, sacrificialItemId: string) {
  return fetchApi<{
    logId: string;
    turns: { currentTurns: number; timeToCapMs: number | null; lastRegenAt: string };
    forge: {
      action: 'reroll';
      success: true;
      itemId: string;
      rarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
      sacrificialItemId: string;
      bonusStats: Record<string, number> | null;
    };
  }>('/api/v1/crafting/forge/reroll', {
    method: 'POST',
    body: JSON.stringify({ itemId, sacrificialItemId }),
  });
}

export interface GatheringNodesQuery {
  page?: number;
  pageSize?: number;
  zoneId?: string;
  resourceType?: string;
  skillRequired?: 'mining' | 'foraging' | 'woodcutting';
}

export interface GatheringNodesResponse {
  nodes: Array<{
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
    resourceTypes: string[];
  };
}

export async function getGatheringNodes(query: GatheringNodesQuery = {}) {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set('page', String(query.page));
  if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize));
  if (query.zoneId) params.set('zoneId', query.zoneId);
  if (query.resourceType) params.set('resourceType', query.resourceType);
  if (query.skillRequired) params.set('skillRequired', query.skillRequired);

  const suffix = params.toString();
  return fetchApi<GatheringNodesResponse>(`/api/v1/gathering/nodes${suffix ? `?${suffix}` : ''}`);
}

// PvP Arena

export interface PvpRatingResponse {
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  winStreak: number;
  bestRating: number;
}

export interface PvpLadderEntry {
  playerId: string;
  username: string;
  rating: number;
  characterLevel: number;
  title?: string;
  titleTier?: number;
}

export interface PvpLadderResponse {
  myRating: PvpRatingResponse;
  opponents: PvpLadderEntry[];
}

export interface PvpScoutData {
  combatLevel: number;
  attackStyle: string;
  armorClass: string;
  powerRating: number;
  myPowerRating: number;
}

export interface PvpMatchResponse {
  matchId: string;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  winnerId: string | null;
  attackerRating: number;
  defenderRating: number;
  attackerRatingChange: number;
  defenderRatingChange: number;
  attackerStyle: string;
  defenderStyle: string;
  isRevenge: boolean;
  turnsSpent: number;
  createdAt: string;
}

export interface PvpChallengeResponse {
  matchId: string;
  attackerId: string;
  defenderId: string;
  attackerName: string;
  defenderName: string;
  winnerId: string | null;
  isDraw: boolean;
  isRevenge: boolean;
  turnsSpent: number;
  attackerRating: number;
  defenderRating: number;
  attackerRatingChange: number;
  defenderRatingChange: number;
  attackerStyle: string;
  defenderStyle: string;
  combat: {
    outcome: CombatOutcomeResponse;
    combatantAMaxHp: number;
    combatantBMaxHp: number;
    combatantAHpRemaining: number;
    combatantBHpRemaining: number;
    log: CombatLogEntryResponse[];
    potionsConsumed: Array<{ tier: number; healAmount: number; round: number }>;
  };
  attackerStartHp: number;
  attackerKnockedOut: boolean;
  fleeOutcome: 'clean_escape' | 'wounded_escape' | 'knockout' | null;
}

export interface PvpNotification {
  matchId: string;
  attackerName: string;
  winnerId: string | null;
  defenderRatingChange: number;
  isRevenge: boolean;
  createdAt: string;
}

export async function getPvpRating() {
  return fetchApi<PvpRatingResponse>('/api/v1/pvp/rating');
}

export async function getPvpLadder() {
  return fetchApi<PvpLadderResponse>('/api/v1/pvp/ladder');
}

export async function scoutPvpOpponent(targetId: string) {
  return fetchApi<PvpScoutData>('/api/v1/pvp/scout', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function challengePvpOpponent(targetId: string) {
  return fetchApi<PvpChallengeResponse>('/api/v1/pvp/challenge', {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export interface PvpMatchDetailResponse extends PvpMatchResponse {
  combatLog: {
    outcome: CombatOutcomeResponse;
    combatantAMaxHp: number;
    combatantBMaxHp: number;
    combatantAHpRemaining: number;
    combatantBHpRemaining: number;
    log: CombatLogEntryResponse[];
    potionsConsumed: Array<{ tier: number; healAmount: number; round: number }>;
  };
}

export async function getPvpMatchDetail(matchId: string) {
  return fetchApi<PvpMatchDetailResponse>(`/api/v1/pvp/history/${matchId}`);
}

export async function getPvpHistory(page = 1, pageSize = 10) {
  return fetchApi<{
    matches: PvpMatchResponse[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean; hasPrevious: boolean };
  }>(`/api/v1/pvp/history?page=${page}&pageSize=${pageSize}`);
}

export async function getPvpNotifications() {
  return fetchApi<{ notifications: PvpNotification[] }>('/api/v1/pvp/notifications');
}

export async function getPvpNotificationCount() {
  return fetchApi<{ count: number }>('/api/v1/pvp/notifications/count');
}

export async function markPvpNotificationsRead(matchIds?: string[]) {
  return fetchApi<{ success: boolean }>('/api/v1/pvp/notifications/read', {
    method: 'POST',
    body: JSON.stringify(matchIds ? { matchIds } : {}),
  });
}

// Chat
export async function getChatHistory(channelType: string, channelId: string) {
  return fetchApi<{
    messages: Array<{
      id: string;
      channelType: string;
      channelId: string;
      playerId: string;
      username: string;
      message: string;
      messageType?: string;
      createdAt: string;
    }>;
  }>(`/api/v1/chat/history?channelType=${encodeURIComponent(channelType)}&channelId=${encodeURIComponent(channelId)}`);
}

// World Events
export interface WorldEventResponse {
  id: string;
  type: string;
  scope: 'zone' | 'world';
  zoneId: string | null;
  zoneName: string | null;
  title: string;
  description: string;
  effectType: string;
  effectValue: number;
  targetFamily: string | null;
  targetResource: string | null;
  startedAt: string;
  expiresAt: string | null;
  status: string;
}

export async function getActiveEvents() {
  return fetchApi<{ events: WorldEventResponse[] }>('/api/v1/events');
}

export async function getZoneEvents(zoneId: string) {
  return fetchApi<{ events: WorldEventResponse[] }>(`/api/v1/events/zone/${zoneId}`);
}

// Boss Encounters
export interface BossPlayerReward {
  loot: Array<{
    itemTemplateId: string;
    quantity: number;
    rarity?: string;
    itemName?: string;
  }>;
  xp?: {
    skillType: string;
    rawXp: number;
    xpAfterEfficiency: number;
    leveledUp: boolean;
    newLevel: number;
  };
  recipeUnlocked?: {
    recipeId: string;
    recipeName: string;
    soulbound: boolean;
  };
}

export interface BossRoundSummary {
  round: number;
  bossDamage: number;
  totalPlayerDamage: number;
  bossHpPercent: number;
  raidPoolPercent: number;
}

export interface BossEncounterResponse {
  id: string;
  eventId: string;
  mobTemplateId: string;
  currentHp: number;
  maxHp: number;
  baseHp: number;
  roundNumber: number;
  nextRoundAt: string | null;
  status: string;
  killedBy: string | null;
  killedByUsername?: string | null;
  mobName: string;
  mobLevel: number;
  zoneId?: string;
  zoneName?: string;
  raidPoolHp?: number;
  raidPoolMax?: number;
  roundSummaries?: BossRoundSummary[] | null;
}

export interface BossParticipantResponse {
  id: string;
  playerId: string;
  username?: string | null;
  role: string;
  roundNumber: number;
  turnsCommitted: number;
  totalDamage: number;
  totalHealing: number;
  attacks: number;
  hits: number;
  crits: number;
  autoSignUp: boolean;
  currentHp: number;
  status: string;
}

export interface BossHistoryEntry {
  encounter: BossEncounterResponse;
  mobName: string;
  mobLevel: number;
  zoneName: string;
  killedByUsername: string | null;
  myRewards?: BossPlayerReward | null;
  playerStats: {
    totalDamage: number;
    totalHealing: number;
    attacks: number;
    hits: number;
    crits: number;
    roundsParticipated: number;
  };
}

export async function getActiveBossEncounters() {
  return fetchApi<{ encounters: BossEncounterResponse[] }>('/api/v1/boss/active');
}

export async function getBossEncounter(id: string) {
  return fetchApi<{
    encounter: BossEncounterResponse;
    participants: BossParticipantResponse[];
    myRewards?: BossPlayerReward | null;
  }>(`/api/v1/boss/${id}`);
}

export async function signUpForBoss(id: string, role: 'attacker' | 'healer', autoSignUp = false) {
  return fetchApi<{ participant: BossParticipantResponse }>(`/api/v1/boss/${id}/signup`, {
    method: 'POST',
    body: JSON.stringify({ role, autoSignUp }),
  });
}

export async function getBossHistory(page = 1, pageSize = 10) {
  return fetchApi<{
    entries: BossHistoryEntry[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/api/v1/boss/history?page=${page}&pageSize=${pageSize}`);
}

// --- Achievements ---

export interface AchievementRewardResponse {
  type: 'xp' | 'turns' | 'attribute_points' | 'item';
  amount: number;
  itemTemplateId?: string;
}

export interface PlayerAchievementProgress {
  id: string;
  category: string;
  title: string;
  description: string;
  titleReward?: string;
  threshold: number;
  secret?: boolean;
  tier?: number;
  statKey?: string;
  familyKey?: string;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
  rewardClaimed?: boolean;
  rewards?: AchievementRewardResponse[];
}

export interface AchievementsResponse {
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
}

export async function getAchievements() {
  return fetchApi<AchievementsResponse>('/api/v1/achievements');
}

export async function getAchievementUnclaimedCount() {
  return fetchApi<{ unclaimedCount: number }>('/api/v1/achievements/unclaimed-count');
}

export async function claimAchievementReward(achievementId: string) {
  return fetchApi<{ success: boolean; rewards: AchievementRewardResponse[] }>(
    `/api/v1/achievements/${achievementId}/claim`,
    { method: 'POST' },
  );
}

export async function getActiveTitle() {
  return fetchApi<{ activeTitle: string | null }>('/api/v1/achievements/title');
}

export async function setActiveTitle(achievementId: string | null) {
  return fetchApi<{ activeTitle: string | null }>('/api/v1/achievements/title', {
    method: 'PUT',
    body: JSON.stringify({ achievementId }),
  });
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  characterLevel: number;
  score: number;
  isBot: boolean;
  title?: string;
  titleTier?: number;
}

export interface LeaderboardResponse {
  category: string;
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  totalPlayers: number;
  lastRefreshedAt: string | null;
}

export interface LeaderboardCategoryGroup {
  name: string;
  categories: { slug: string; label: string }[];
}

export interface LeaderboardCategoriesResponse {
  groups: LeaderboardCategoryGroup[];
}

export async function getLeaderboardCategories() {
  return fetchApi<LeaderboardCategoriesResponse>('/api/v1/leaderboard/categories');
}

export async function getLeaderboard(category: string, aroundMe = false) {
  const params = aroundMe ? '?around_me=true' : '';
  return fetchApi<LeaderboardResponse>(`/api/v1/leaderboard/${category}${params}`);
}

// ---------------------------------------------------------------------------
// Guild
// ---------------------------------------------------------------------------

export interface GuildResponse {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leaderId: string;
  leaderUsername?: string;
  level: number;
  xp: string;
  memberCount: number;
  maxMembers: number;
  recruitmentMode: string;
  minLevelRequirement: number;
  taxRate: number;
  specialization: string | null;
  renown: number;
  seasonalRenown: number;
  treasuryTurns: number;
  treasuryCap: number;
  createdAt: string;
}

export interface GuildMemberResponse {
  playerId: string;
  username: string;
  characterLevel: number;
  role: string;
  joinedAt: string;
  totalTurnsContributed: number;
  weeklyTurnsContributed: number;
  isActive: boolean;
}

export interface PlayerGuildResponse {
  guild: GuildResponse;
  role: string;
  members: GuildMemberResponse[];
}

export interface GuildSearchResponse {
  guilds: GuildResponse[];
  total: number;
  page: number;
}

export interface GuildLogResponse {
  entries: { id: string; eventType: string; message: string; metadata: Record<string, unknown> | null; createdAt: string }[];
  total: number;
  page: number;
}

export async function getPlayerGuild() {
  return fetchApi<PlayerGuildResponse | null>('/api/v1/guild');
}

export async function createGuild(name: string, tag: string, description: string | null) {
  return fetchApi<GuildResponse>('/api/v1/guild', {
    method: 'POST',
    body: JSON.stringify({ name, tag, description }),
  });
}

export async function searchGuilds(query?: string, page?: number) {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (page) params.set('page', String(page));
  return fetchApi<GuildSearchResponse>(`/api/v1/guild/search?${params}`);
}

export async function joinGuild(guildId: string) {
  return fetchApi<GuildResponse>(`/api/v1/guild/${guildId}/join`, { method: 'POST' });
}

export async function leaveGuild(guildId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/leave`, { method: 'POST' });
}

export async function kickGuildMember(guildId: string, targetId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/kick`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function promoteGuildMember(guildId: string, targetId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/promote`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function demoteGuildMember(guildId: string, targetId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/demote`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function transferGuildLeadership(guildId: string, targetId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/transfer`, {
    method: 'POST',
    body: JSON.stringify({ targetId }),
  });
}

export async function disbandGuild(guildId: string) {
  return fetchApi(`/api/v1/guild/${guildId}`, { method: 'DELETE' });
}

export async function updateGuildSettings(guildId: string, settings: Record<string, unknown>) {
  return fetchApi<GuildResponse>(`/api/v1/guild/${guildId}`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

export async function getGuildLog(guildId: string, page?: number) {
  const params = page ? `?page=${page}` : '';
  return fetchApi<GuildLogResponse>(`/api/v1/guild/${guildId}/log${params}`);
}
