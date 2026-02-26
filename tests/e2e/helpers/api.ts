import { APIRequestContext, request } from '@playwright/test';
import pg from 'pg';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5433/adventure_fix_e2e_tests';

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

  private authHeaders(): Record<string, string> {
    if (!this.tokens) return {};
    return { Authorization: `Bearer ${this.tokens.accessToken}` };
  }

  // --- Auth ---

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

  // --- Player ---

  async getPlayer() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/player', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getPlayer failed: ${res.status()}`);
    return res.json();
  }

  async getPlayerSkills() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/player/skills', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getPlayerSkills failed: ${res.status()}`);
    return res.json();
  }

  async skipTutorial() {
    const ctx = await this.getContext();
    const res = await ctx.patch('/api/v1/player/tutorial', {
      headers: this.authHeaders(),
      data: { step: -1 },
    });
    if (!res.ok()) throw new Error(`skipTutorial failed: ${res.status()}`);
    return res.json();
  }

  async updatePlayerSettings(settings: Record<string, unknown>) {
    const ctx = await this.getContext();
    const res = await ctx.patch('/api/v1/player/settings', {
      headers: this.authHeaders(),
      data: settings,
    });
    if (!res.ok()) throw new Error(`updatePlayerSettings failed: ${res.status()}`);
    return res.json();
  }

  // --- Turns ---

  async getTurns() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/turns', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getTurns failed: ${res.status()}`);
    return res.json();
  }

  // --- HP ---

  async getHp() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/hp', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getHp failed: ${res.status()}`);
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

  // --- Zones ---

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

  // --- Exploration ---

  async explore(turns: number) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/exploration/start', {
      headers: this.authHeaders(),
      data: { turns },
    });
    if (!res.ok()) throw new Error(`explore failed: ${res.status()}`);
    return res.json();
  }

  // --- Combat ---

  async getCombatSites() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/combat/sites', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getCombatSites failed: ${res.status()}`);
    return res.json();
  }

  async selectStrategy(siteId: string, strategy: 'full_clear' | 'room_by_room' = 'full_clear') {
    const ctx = await this.getContext();
    const res = await ctx.post(`/api/v1/combat/sites/${siteId}/strategy`, {
      headers: this.authHeaders(),
      data: { strategy },
    });
    if (!res.ok()) throw new Error(`selectStrategy failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  async startCombat(encounterSiteId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/combat/start', {
      headers: this.authHeaders(),
      data: { encounterSiteId },
    });
    if (!res.ok()) throw new Error(`startCombat failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  /** Select strategy and start combat in one call */
  async fightEncounter(siteId: string) {
    await this.selectStrategy(siteId, 'full_clear');
    return this.startCombat(siteId);
  }

  async getCombatLogs(page = 1, pageSize = 20) {
    const ctx = await this.getContext();
    const res = await ctx.get(`/api/v1/combat/logs?page=${page}&pageSize=${pageSize}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`getCombatLogs failed: ${res.status()}`);
    return res.json();
  }

  async getCombatLog(id: string) {
    const ctx = await this.getContext();
    const res = await ctx.get(`/api/v1/combat/logs/${id}`, { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getCombatLog failed: ${res.status()}`);
    return res.json();
  }

  // --- Inventory ---

  async getInventory() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/inventory', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getInventory failed: ${res.status()}`);
    return res.json();
  }

  // --- Achievements ---

  async getAchievements() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/achievements', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getAchievements failed: ${res.status()}`);
    return res.json();
  }

  async claimAchievement(id: string) {
    const ctx = await this.getContext();
    const res = await ctx.post(`/api/v1/achievements/${id}/claim`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`claimAchievement failed: ${res.status()}`);
    return res.json();
  }

  async setTitle(achievementId: string | null) {
    const ctx = await this.getContext();
    const res = await ctx.put('/api/v1/achievements/title', {
      headers: this.authHeaders(),
      data: { achievementId },
    });
    if (!res.ok()) throw new Error(`setTitle failed: ${res.status()}`);
    return res.json();
  }

  // --- Leaderboard ---

  async getLeaderboardCategories() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/leaderboard/categories', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getLeaderboardCategories failed: ${res.status()}`);
    return res.json();
  }

  async getLeaderboard(category: string) {
    const ctx = await this.getContext();
    const res = await ctx.get(`/api/v1/leaderboard/${category}`, { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getLeaderboard failed: ${res.status()}`);
    return res.json();
  }

  // --- World Events ---

  async getWorldEvents() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/events', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getWorldEvents failed: ${res.status()}`);
    return res.json();
  }

  async getZoneEvents(zoneId: string) {
    const ctx = await this.getContext();
    const res = await ctx.get(`/api/v1/events/zone/${zoneId}`, { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getZoneEvents failed: ${res.status()}`);
    return res.json();
  }

  // --- PvP ---

  async getPvpLadder() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/pvp/ladder', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getPvpLadder failed: ${res.status()}`);
    return res.json();
  }

  async getPvpRating() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/pvp/rating', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getPvpRating failed: ${res.status()}`);
    return res.json();
  }

  async scoutOpponent(targetId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/pvp/scout', {
      headers: this.authHeaders(),
      data: { targetId },
    });
    if (!res.ok()) throw new Error(`scoutOpponent failed: ${res.status()}`);
    return res.json();
  }

  async challengeOpponent(targetId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/pvp/challenge', {
      headers: this.authHeaders(),
      data: { targetId },
    });
    if (!res.ok()) throw new Error(`challengeOpponent failed: ${res.status()}`);
    return res.json();
  }

  async getPvpHistory(page = 1) {
    const ctx = await this.getContext();
    const res = await ctx.get(`/api/v1/pvp/history?page=${page}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`getPvpHistory failed: ${res.status()}`);
    return res.json();
  }

  async getPvpNotifications() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/pvp/notifications', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getPvpNotifications failed: ${res.status()}`);
    return res.json();
  }

  // --- Guild ---

  async createGuild(name: string, tag: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/guild', {
      headers: this.authHeaders(),
      data: { name, tag },
    });
    if (!res.ok()) throw new Error(`createGuild failed: ${res.status()} ${await res.text()}`);
    return res.json();
  }

  async getGuild() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/guild', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getGuild failed: ${res.status()}`);
    return res.json();
  }

  async searchGuilds(query = '') {
    const ctx = await this.getContext();
    const params = query ? `?search=${encodeURIComponent(query)}` : '';
    const res = await ctx.get(`/api/v1/guild/search${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`searchGuilds failed: ${res.status()}`);
    return res.json();
  }

  async leaveGuild(guildId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post(`/api/v1/guild/${guildId}/leave`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`leaveGuild failed: ${res.status()}`);
    return res.json();
  }

  async joinGuild(guildId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post(`/api/v1/guild/${guildId}/join`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`joinGuild failed: ${res.status()}`);
    return res.json();
  }

  // --- Boss ---

  async getBossActive() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/boss/active', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`getBossActive failed: ${res.status()}`);
    return res.json();
  }

  async getBossHistory(page = 1) {
    const ctx = await this.getContext();
    const res = await ctx.get(`/api/v1/boss/history?page=${page}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok()) throw new Error(`getBossHistory failed: ${res.status()}`);
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

  async adminSpawnBoss(mobTemplateId: string, zoneId: string) {
    const ctx = await this.getContext();
    const res = await ctx.post('/api/v1/admin/boss/spawn', {
      headers: this.authHeaders(),
      data: { mobTemplateId, zoneId },
    });
    if (!res.ok()) throw new Error(`adminSpawnBoss failed: ${res.status()}`);
    return res.json();
  }

  async adminGetMobs() {
    const ctx = await this.getContext();
    const res = await ctx.get('/api/v1/admin/mobs', { headers: this.authHeaders() });
    if (!res.ok()) throw new Error(`adminGetMobs failed: ${res.status()}`);
    return res.json();
  }

  async promoteToAdmin() {
    const client = new pg.Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query(`UPDATE players SET role = 'admin' WHERE id = $1`, [this.playerId]);
    } finally {
      await client.end();
    }
  }

  async dispose() {
    if (this.ctx) await this.ctx.dispose();
  }
}
