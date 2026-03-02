import { fetchApi } from './core';
import type { ResourceState } from '@adventure/shared';

export interface CombatResourceResponse {
  stamina: ResourceState;
  mana: ResourceState;
}

export async function getResources() {
  return fetchApi<CombatResourceResponse>('/api/v1/resources');
}
