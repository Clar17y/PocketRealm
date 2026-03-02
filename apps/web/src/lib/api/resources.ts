import { fetchApi } from './core';

export interface ResourcePoolState {
  current: number;
  max: number;
  regenPerRound: number;
  regenPerSecond: number;
}

export interface CombatResourceResponse {
  stamina: ResourcePoolState;
  mana: ResourcePoolState;
}

export async function getResources() {
  return fetchApi<CombatResourceResponse>('/api/v1/resources');
}
