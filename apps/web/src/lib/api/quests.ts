import { fetchApi } from './core';
import type { PlayerQuestData, PlayerQuestStateData } from '@pocketrealm/shared';

export interface QuestsResponse {
  quests: PlayerQuestData[];
  state: PlayerQuestStateData;
}

export interface ClaimRewardResponse {
  tokensAwarded: number;
  newBalance: number;
}

export interface ClaimBonusResponse {
  tokensAwarded: number;
  newBalance: number;
}

export async function getQuests() {
  return fetchApi<QuestsResponse>('/api/v1/quests');
}

export async function claimQuestReward(questId: string) {
  return fetchApi<ClaimRewardResponse>(`/api/v1/quests/${questId}/claim`, { method: 'POST' });
}

export async function claimDailyBonus() {
  return fetchApi<ClaimBonusResponse>('/api/v1/quests/bonus', { method: 'POST' });
}

export interface RerollQuestResponse {
  quest: PlayerQuestData;
}

export async function rerollQuest(questId: string) {
  return fetchApi<RerollQuestResponse>(`/api/v1/quests/${questId}/reroll`, { method: 'POST' });
}
