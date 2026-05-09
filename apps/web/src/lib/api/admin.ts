import { fetchApi } from './core';
import type { StateUpdates } from '@pocketrealm/shared';

export interface AdminItemTemplate {
  id: string;
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  stackable: boolean;
  requiredLevel: number | null;
}

export interface AdminZone {
  id: string;
  name: string;
  difficulty: number;
  zoneType: string;
  connectionsFrom: Array<{ toId: string; explorationThreshold: number }>;
}

export interface AdminMobTemplate {
  id: string;
  name: string;
  level: number;
  hp: number;
  bossBaseHp: number | null;
}

export interface AdminMobFamily {
  id: string;
  name: string;
}

export interface AdminEventTemplate {
  id: number;
  type: string;
  scope: string;
  title: string;
  description: string;
  effectType: string;
  effectValue: number;
  targeting: string;
  fixedTarget?: string;
}

export interface AdminActiveEvent {
  id: string;
  title: string;
  type: string;
  effectType: string;
  effectValue: number;
  zoneName: string;
  status: string;
  expiresAt: string | null;
}

export interface AdminResourceNode {
  id: string;
  zoneId: string;
  resourceType: string;
  skillRequired: string;
  levelRequired: number;
  baseYield: number;
  minCapacity: number;
  maxCapacity: number;
  zone: { name: string };
}

export interface AdminSeason {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  isBootstrapped: boolean;
}

type AdminSeasonCreateInput = {
  name: string;
  startsAt: string;
  endsAt: string;
  constantOverrides?: Record<string, Record<string, number>>;
  features?: string[];
};

type AdminSeasonRecord = Omit<AdminSeason, 'isBootstrapped'>;

export async function adminGrantTurns(amount: number) {
  return fetchApi<{ success: boolean; currentTurns: number }>('/api/v1/admin/turns/grant', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminSetLevel(level: number) {
  return fetchApi<{ success: boolean; level: number; characterXp: number; stateUpdates?: StateUpdates }>('/api/v1/admin/player/level', {
    method: 'POST',
    body: JSON.stringify({ level }),
  });
}

export async function adminGrantXp(amount: number) {
  return fetchApi<{ success: boolean; characterXp: number; characterLevel: number; stateUpdates?: StateUpdates }>('/api/v1/admin/player/xp', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminSetAttributes(data: { attributePoints?: number; attributes?: Record<string, number> }) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/player/attributes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminSetSkillLevel(skillType: string, level: number) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/set-skill-level', {
    method: 'POST',
    body: JSON.stringify({ skillType, level }),
  });
}

export async function adminSetSkillLevels(skillTypes: string[], level: number) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/set-skill-levels', {
    method: 'POST',
    body: JSON.stringify({ skillTypes, level }),
  });
}

export async function adminGetItemTemplates(search?: string, type?: string) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (type) params.set('type', type);
  const qs = params.toString();
  return fetchApi<{ templates: AdminItemTemplate[] }>(`/api/v1/admin/items/templates${qs ? `?${qs}` : ''}`);
}

export async function adminGrantItem(templateId: string, rarity: string, quantity: number) {
  return fetchApi<{ success: boolean; stateUpdates?: StateUpdates }>('/api/v1/admin/items/grant', {
    method: 'POST',
    body: JSON.stringify({ templateId, rarity, quantity }),
  });
}

export async function adminGetEventTemplates() {
  return fetchApi<{ templates: AdminEventTemplate[] }>('/api/v1/admin/events/templates');
}

export async function adminGetActiveEvents() {
  return fetchApi<{ events: AdminActiveEvent[] }>('/api/v1/admin/events/active');
}

export async function adminSpawnEvent(templateIndex: number, zoneId: string, durationHours?: number, target?: string) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/events/spawn', {
    method: 'POST',
    body: JSON.stringify({ templateIndex, zoneId, durationHours, ...(target && { target }) }),
  });
}

export async function adminCancelEvent(eventId: string) {
  return fetchApi<{ success: boolean }>(`/api/v1/admin/events/${eventId}/cancel`, { method: 'POST' });
}

export async function adminGetMobs() {
  return fetchApi<{ mobs: AdminMobTemplate[] }>('/api/v1/admin/mobs');
}

export async function adminGetMobFamilies(zoneId?: string) {
  const qs = zoneId ? `?zoneId=${zoneId}` : '';
  return fetchApi<{ families: AdminMobFamily[] }>(`/api/v1/admin/mob-families${qs}`);
}

export async function adminSpawnBoss(mobTemplateId: string, zoneId: string) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/boss/spawn', {
    method: 'POST',
    body: JSON.stringify({ mobTemplateId, zoneId }),
  });
}

export async function adminGetZones() {
  return fetchApi<{ zones: AdminZone[] }>('/api/v1/admin/zones');
}

export async function adminDiscoverAllZones() {
  return fetchApi<{ success: boolean; discoveredCount: number }>('/api/v1/admin/zones/discover-all', { method: 'POST' });
}

export async function adminTeleport(zoneId: string) {
  return fetchApi<{ success: boolean; zoneId: string; stateUpdates: StateUpdates }>('/api/v1/admin/zones/teleport', {
    method: 'POST',
    body: JSON.stringify({ zoneId }),
  });
}

export async function adminSpawnEncounter(mobFamilyId: string, zoneId: string, size: string) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/encounter/spawn', {
    method: 'POST',
    body: JSON.stringify({ mobFamilyId, zoneId, size }),
  });
}

export async function adminGetResourceNodes(zoneId?: string) {
  const qs = zoneId ? `?zoneId=${zoneId}` : '';
  return fetchApi<{ nodes: AdminResourceNode[] }>(`/api/v1/admin/resource-nodes${qs}`);
}

export async function adminGetSeasons() {
  return fetchApi<{ seasons: AdminSeason[] }>('/api/v1/admin/seasons');
}

export async function adminCreateSeason(data: AdminSeasonCreateInput) {
  return fetchApi<{ season: AdminSeasonRecord }>('/api/v1/admin/seasons', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminBootstrapSeason(id: string) {
  return fetchApi<{ message: string; seasonId: string }>(`/api/v1/admin/seasons/${id}/bootstrap`, {
    method: 'POST',
  });
}

export async function adminActivateSeason(id: string) {
  return fetchApi<{ season: AdminSeasonRecord }>(`/api/v1/admin/seasons/${id}/activate`, {
    method: 'POST',
  });
}

export async function adminEndSeason(id: string) {
  return fetchApi<{ message: string }>(`/api/v1/admin/seasons/${id}/end`, {
    method: 'POST',
  });
}

export async function adminEvaluateSeasonRewards(id: string) {
  return fetchApi<{ message: string; hallOfFameEntries: number }>(`/api/v1/admin/seasons/${id}/evaluate-rewards`, {
    method: 'POST',
  });
}

export async function adminMergeSeason(id: string) {
  return fetchApi<{ message: string; merged: number; errors: string[] }>(`/api/v1/admin/seasons/${id}/merge`, {
    method: 'POST',
  });
}

export async function adminSpawnResourceNode(resourceNodeId: string, capacity?: number) {
  return fetchApi<{ success: boolean; resourceType: string; capacity: number }>('/api/v1/admin/resource-nodes/spawn', {
    method: 'POST',
    body: JSON.stringify({ resourceNodeId, ...(capacity !== undefined && { capacity }) }),
  });
}

export async function adminGrantTokens(amount: number) {
  return fetchApi<{ success: boolean; questTokens: number }>('/api/v1/admin/tokens/grant', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminGrantGuildTreasury(amount: number) {
  return fetchApi<{ success: boolean; treasuryTurns: number }>('/api/v1/admin/guild/treasury', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminResetExpeditionCooldowns() {
  return fetchApi<{ success: boolean; expeditionsReset: number }>(
    '/api/v1/admin/expedition/reset-cooldowns',
    { method: 'POST' },
  );
}

export async function adminFillExpedition() {
  return fetchApi<{ message: string; botsCreated: number; totalParticipants: number; minRequired: number }>(
    '/api/v1/admin/expedition/fill',
    { method: 'POST' },
  );
}

export interface BalanceReport {
  period: string;
  generatedAt: string;
  activePlayers: number;
  skillDistribution: Record<string, { avg: number; median: number; p90: number; playerCount: number }>;
  turnDistribution: Record<string, { totalTurns: number; actionCount: number; avgTurnsPerAction: number }>;
  xpEfficiency: Record<string, { totalXpGained: number; totalTurnsSpent: number; xpPerTurn: number }>;
  progressionVelocity: Record<string, { atLevel5: number; atLevel10: number; atLevel15: number; atLevel20: number; atLevel30: number }>;
  zoneActivity: Record<string, { totalTurns: number; actionCount: number; uniquePlayers: number }>;
}

export type BalancePeriod = '1h' | '24h' | '7d' | '30d';

export async function adminGetBalanceReport(period: BalancePeriod = '7d') {
  return fetchApi<BalanceReport>(`/api/v1/admin/analytics/balance?period=${period}`);
}

export type LatencyPeriod = '1h' | '6h' | '24h' | '7d' | '30d';
export type LatencyMetric = 'avgMs' | 'p50Ms' | 'p90Ms' | 'p95Ms' | 'p99Ms';

export interface LatencyActionSummary {
  action: string;
  requestCount: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
}

export interface LatencySeriesPoint {
  bucketStart: string;
  action: string;
  requestCount: number;
  avgMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  errorRate: number;
  connectedPlayers: number;
  activeConnections: number;
  eventLoopLagMs: number;
  memoryUsageMb: number;
}

export interface LatencyReport {
  period: LatencyPeriod;
  bucketSizeSeconds: number;
  generatedAt: string;
  actions: LatencyActionSummary[];
  series: LatencySeriesPoint[];
}

export async function adminGetLatencyReport(period: LatencyPeriod = '1h', action?: string) {
  const params = new URLSearchParams({ period });
  if (action) params.set('action', action);
  return fetchApi<LatencyReport>(`/api/v1/admin/analytics/latency?${params.toString()}`);
}

export async function adminGetLatencyActions(period: LatencyPeriod = '24h') {
  return fetchApi<{ actions: string[] }>(`/api/v1/admin/analytics/latency/actions?period=${period}`);
}
