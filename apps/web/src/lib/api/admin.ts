import { fetchApi } from './core';

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

export async function adminGrantTurns(amount: number) {
  return fetchApi<{ success: boolean; currentTurns: number }>('/api/v1/admin/turns/grant', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminSetLevel(level: number) {
  return fetchApi<{ success: boolean; level: number; characterXp: number }>('/api/v1/admin/player/level', {
    method: 'POST',
    body: JSON.stringify({ level }),
  });
}

export async function adminGrantXp(amount: number) {
  return fetchApi<{ success: boolean; characterXp: number; characterLevel: number }>('/api/v1/admin/player/xp', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export async function adminSetAttributes(data: { attributePoints?: number; attributes?: Record<string, number> }) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/player/attributes', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function adminSetSkillLevel(skillType: string, level: number) {
  return fetchApi<{ success: boolean }>('/api/v1/admin/set-skill-level', {
    method: 'POST',
    body: JSON.stringify({ skillType, level }),
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
  return fetchApi<{ success: boolean }>('/api/v1/admin/items/grant', {
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
  return fetchApi<{ success: boolean }>('/api/v1/admin/zones/teleport', {
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
