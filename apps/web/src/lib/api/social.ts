import { fetchApi } from './core';
import type { CombatLogEntryResponse, CombatOutcomeResponse } from './combat';

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
  isAdmin?: boolean;
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

// Achievements

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

// Leaderboard

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  username: string;
  characterLevel: number;
  score: number;
  isBot: boolean;
  isAdmin: boolean;
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
