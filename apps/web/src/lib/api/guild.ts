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
