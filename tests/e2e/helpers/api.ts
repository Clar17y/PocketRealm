import { APIRequestContext, request } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  player: { id: string; username: string; email: string; role: string };
}

export class ApiHelper {
  private tokens: AuthTokens | null = null;
  private ctx: APIRequestContext | null = null;

  get playerId(): string {
    if (!this.tokens) throw new Error('Not authenticated — call register() or login() first');
    return this.tokens.player.id;
  }

  get accessToken(): string {
    if (!this.tokens) throw new Error('Not authenticated');
    return this.tokens.accessToken;
  }

  get player() {
    if (!this.tokens) throw new Error('Not authenticated');
    return this.tokens.player;
  }

  private async getContext(): Promise<APIRequestContext> {
    if (!this.ctx) {
      this.ctx = await request.newContext({ baseURL: API_URL });
    }
    return this.ctx;
  }

  private authHeaders() {
    return this.tokens
      ? { Authorization: `Bearer ${this.tokens.accessToken}` }
      : {};
  }

  async register(username: string, email: string, password: string): Promise<AuthTokens> {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/auth/register', {
      data: { username, email, password },
    });
    if (!res.ok()) throw new Error(`Register failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    this.tokens = body;
    return body;
  }

  async login(email: string, password: string): Promise<AuthTokens> {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/auth/login', {
      data: { email, password },
    });
    if (!res.ok()) throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
    const body = await res.json();
    this.tokens = body;
    return body;
  }

  async getPlayer() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/player', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getPlayer failed: ${res.status()}`);
    return res.json();
  }

  async getTurns() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/turns', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getTurns failed: ${res.status()}`);
    return res.json();
  }

  async getHp() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/hp', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getHp failed: ${res.status()}`);
    return res.json();
  }

  async getZones() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/zones', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getZones failed: ${res.status()}`);
    return res.json();
  }

  async travel(zoneId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/zones/travel', {
      headers: this.authHeaders(),
      data: { zoneId },
    });
    if (!res.ok()) throw new Error(`travel failed: ${res.status()}`);
    return res.json();
  }

  async explore(turns: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/exploration/start', {
      headers: this.authHeaders(),
      data: { turns },
    });
    if (!res.ok()) throw new Error(`explore failed: ${res.status()}`);
    return res.json();
  }

  async startCombat(siteId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/combat/start', {
      headers: this.authHeaders(),
      data: { siteId },
    });
    if (!res.ok()) throw new Error(`startCombat failed: ${res.status()}`);
    return res.json();
  }

  async getCombatSites() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/combat/sites', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getCombatSites failed: ${res.status()}`);
    return res.json();
  }

  async getInventory() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/inventory', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getInventory failed: ${res.status()}`);
    return res.json();
  }

  async rest(turns: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/hp/rest', {
      headers: this.authHeaders(),
      data: { turns },
    });
    if (!res.ok()) throw new Error(`rest failed: ${res.status()}`);
    return res.json();
  }

  async recover() {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/hp/recover', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`recover failed: ${res.status()}`);
    return res.json();
  }

  // --- Admin endpoints (player must have admin role) ---

  async adminGrantTurns(amount: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/turns/grant', {
      headers: this.authHeaders(),
      data: { amount },
    });
    if (!res.ok()) throw new Error(`adminGrantTurns failed: ${res.status()}`);
    return res.json();
  }

  async adminSetLevel(level: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/player/level', {
      headers: this.authHeaders(),
      data: { level },
    });
    if (!res.ok()) throw new Error(`adminSetLevel failed: ${res.status()}`);
    return res.json();
  }

  async adminGrantXp(amount: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/player/xp', {
      headers: this.authHeaders(),
      data: { amount },
    });
    if (!res.ok()) throw new Error(`adminGrantXp failed: ${res.status()}`);
    return res.json();
  }

  async adminSetAttributes(attributes?: Record<string, number>, attributePoints?: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/player/attributes', {
      headers: this.authHeaders(),
      data: { attributes, attributePoints },
    });
    if (!res.ok()) throw new Error(`adminSetAttributes failed: ${res.status()}`);
    return res.json();
  }

  async adminGrantItem(templateId: string, rarity: string, quantity = 1) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/items/grant', {
      headers: this.authHeaders(),
      data: { templateId, rarity, quantity },
    });
    if (!res.ok()) throw new Error(`adminGrantItem failed: ${res.status()}`);
    return res.json();
  }

  async adminSearchItems(search?: string, type?: string) {
    const ctx = await this.getContext();
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (type) params.set('type', type);
    const res = await ctx.get(`/api/v1/admin/items/templates?${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`adminSearchItems failed: ${res.status()}`);
    return res.json();
  }

  async adminDiscoverAllZones() {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/zones/discover-all', {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`adminDiscoverAllZones failed: ${res.status()}`);
    return res.json();
  }

  async adminTeleport(zoneId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/zones/teleport', {
      headers: this.authHeaders(),
      data: { zoneId },
    });
    if (!res.ok()) throw new Error(`adminTeleport failed: ${res.status()}`);
    return res.json();
  }

  async adminSpawnEncounter(mobFamilyId: string, zoneId: string, size: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/encounter/spawn', {
      headers: this.authHeaders(),
      data: { mobFamilyId, zoneId, size },
    });
    if (!res.ok()) throw new Error(`adminSpawnEncounter failed: ${res.status()}`);
    return res.json();
  }

  async adminGetZones() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/admin/zones', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`adminGetZones failed: ${res.status()}`);
    return res.json();
  }

  async adminGetMobFamilies(zoneId?: string) {
    const ctx = await this.getContext();
    const params = zoneId ? `?zoneId=${zoneId}` : '';
    const res = await ctx.get(`/api/v1/admin/mob-families${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`adminGetMobFamilies failed: ${res.status()}`);
    return res.json();
  }

  async adminSpawnResourceNode(resourceNodeId: string, capacity?: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/resource-nodes/spawn', {
      headers: this.authHeaders(),
      data: { resourceNodeId, capacity },
    });
    if (!res.ok()) throw new Error(`adminSpawnResourceNode failed: ${res.status()}`);
    return res.json();
  }

  async adminGetResourceNodes(zoneId?: string) {
    const ctx = await this.getContext();
    const params = zoneId ? `?zoneId=${zoneId}` : '';
    const res = await ctx.get(`/api/v1/admin/resource-nodes${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`adminGetResourceNodes failed: ${res.status()}`);
    return res.json();
  }

  async adminSpawnEvent(templateIndex: number, zoneId: string, durationHours: number, target?: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/events/spawn', {
      headers: this.authHeaders(),
      data: { templateIndex, zoneId, durationHours, target },
    });
    if (!res.ok()) throw new Error(`adminSpawnEvent failed: ${res.status()}`);
    return res.json();
  }

  async adminGetEventTemplates() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/admin/events/templates', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`adminGetEventTemplates failed: ${res.status()}`);
    return res.json();
  }

  async adminGetActiveEvents() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/admin/events/active', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`adminGetActiveEvents failed: ${res.status()}`);
    return res.json();
  }

  async adminCancelEvent(eventId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post(`/api/v1/admin/events/${eventId}/cancel`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`adminCancelEvent failed: ${res.status()}`);
    return res.json();
  }

  async dispose() {
    if (this.ctx) await this.ctx.dispose();
  }
}
