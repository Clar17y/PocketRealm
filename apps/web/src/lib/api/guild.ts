import { fetchApi } from './core';

// ---------------------------------------------------------------------------
// Types
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

export interface GuildUpgradeResponse {
  id: string;
  upgradeKey: string;
  tier: number;
  effectType: string;
  effectValue: number;
  activatedAt: string;
  expiresAt: string;
  activatedBy: string;
}

export interface GuildUpgradeTierResponse {
  level: number;
  effectValue: number;
  cost: number;
  durationMs: number;
  available: boolean;
  reason?: string;
}

export interface GuildAvailableUpgradeResponse {
  key: string;
  name: string;
  effectType: string;
  tiers: GuildUpgradeTierResponse[];
  activeUpgrade: GuildUpgradeResponse | null;
}

export interface GuildUpgradesResponse {
  active: GuildUpgradeResponse[];
  available: GuildAvailableUpgradeResponse[];
}

export interface GuildContractResponse {
  id: string;
  contractKey: string;
  name: string;
  targetValue: number;
  currentValue: number;
  status: string;
  rewardGuildXp: number;
  rewardTreasuryTurns: number;
  weekStartedAt: string;
  expiresAt: string;
}

export interface GuildContractsResponse {
  contracts: GuildContractResponse[];
}

export interface GuildJoinRequestResponse {
  id: string;
  playerId: string;
  username: string;
  characterLevel: number;
  createdAt: string;
}

export interface GuildJoinRequestsResponse {
  requests: GuildJoinRequestResponse[];
}

// --- Projects ---

export interface GuildProjectContributionResponse {
  playerId: string;
  username: string;
  turnsContributed: number;
  materialsContributed: Record<string, number>;
}

export interface GuildProjectResponse {
  id: string;
  projectKey: string;
  name: string;
  description: string;
  level: number;
  status: string;
  treasuryCost: number;
  materialCosts: { category: string; quantity: number }[];
  materialsProgress: Record<string, number>;
  memberTurnGoal: number;
  turnsContributed: number;
  perks: { effectType: string; value: number }[];
  startedAt: string;
  completedAt: string | null;
  contributions?: GuildProjectContributionResponse[];
}

export interface GuildProjectAvailableResponse {
  key: string;
  name: string;
  description: string;
  level: number;
  prerequisites: string[];
  treasuryCost: number;
  materialCosts: { category: string; quantity: number }[];
  memberTurnGoal: number;
  perks: { effectType: string; value: number }[];
  guildXpReward: number;
  canStart: boolean;
  reason?: string;
}

export interface GuildProjectsListResponse {
  projects: GuildProjectResponse[];
  available: GuildProjectAvailableResponse[];
}

// --- Specialization ---

export interface SpecializationTierBonusResponse {
  effectType: string;
  value: number;
}

export interface SpecializationStatusResponse {
  path: string;
  name: string;
  description: string;
  activeTier: number;
  bonuses: SpecializationTierBonusResponse[];
  nextTier: {
    tier: number;
    guildLevelGate: number;
    bonuses: SpecializationTierBonusResponse[];
  } | null;
}

// ---------------------------------------------------------------------------
// Shared UI Labels
// ---------------------------------------------------------------------------

export const GUILD_MODIFIER_LABELS: Record<string, string> = {
  craftingCrit: 'Crafting Crit',
  xpBoost: 'Skill XP',
  travelCostReduction: 'Travel Cost Reduction',
  repairCostReduction: 'Repair Cost Reduction',
  gatheringYield: 'Gathering Yield',
  combatDamage: 'Combat Damage',
  defenseBoost: 'Defense',
};

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

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

export async function getGuildUpgrades(guildId: string) {
  return fetchApi<GuildUpgradesResponse>(`/api/v1/guild/${guildId}/upgrades`);
}

export async function activateGuildUpgrade(guildId: string, upgradeKey: string, tier: number) {
  return fetchApi<GuildUpgradeResponse>(`/api/v1/guild/${guildId}/upgrades/activate`, {
    method: 'POST',
    body: JSON.stringify({ upgradeKey, tier }),
  });
}

export async function getGuildContracts(guildId: string) {
  return fetchApi<GuildContractsResponse>(`/api/v1/guild/${guildId}/contracts`);
}

// --- Projects ---

export async function getGuildProjects(guildId: string) {
  return fetchApi<GuildProjectsListResponse>(`/api/v1/guild/${guildId}/projects`);
}

export async function startGuildProject(guildId: string, projectKey: string) {
  return fetchApi<GuildProjectResponse>(`/api/v1/guild/${guildId}/projects/start`, {
    method: 'POST',
    body: JSON.stringify({ projectKey }),
  });
}

export async function contributeProjectTurns(guildId: string, projectId: string, amount: number) {
  return fetchApi<GuildProjectResponse>(`/api/v1/guild/${guildId}/projects/${projectId}/contribute/turns`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function contributeProjectMaterials(guildId: string, projectId: string, templateId: string, quantity: number) {
  return fetchApi<GuildProjectResponse>(`/api/v1/guild/${guildId}/projects/${projectId}/contribute/materials`, {
    method: 'POST',
    body: JSON.stringify({ templateId, quantity }),
  });
}

// --- Specialization ---

export async function getGuildSpecialization(guildId: string) {
  return fetchApi<SpecializationStatusResponse | null>(`/api/v1/guild/${guildId}/specialization`);
}

export async function selectGuildSpecialization(guildId: string, path: string) {
  return fetchApi<{ specialization: string }>(`/api/v1/guild/${guildId}/specialization/select`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

export async function respecGuildSpecialization(guildId: string, path: string) {
  return fetchApi<{ specialization: string }>(`/api/v1/guild/${guildId}/specialization/respec`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  });
}

// --- Join Requests ---

export async function requestJoinGuild(guildId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/request`, { method: 'POST' });
}

export async function getGuildJoinRequests(guildId: string) {
  return fetchApi<GuildJoinRequestsResponse>(`/api/v1/guild/${guildId}/requests`);
}

export async function acceptJoinRequest(guildId: string, requestId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/requests/${requestId}/accept`, { method: 'POST' });
}

export async function rejectJoinRequest(guildId: string, requestId: string) {
  return fetchApi(`/api/v1/guild/${guildId}/requests/${requestId}/reject`, { method: 'POST' });
}
