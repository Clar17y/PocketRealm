import { fetchApi } from './core';
import type { TalentNodeDefinition } from '@adventure/shared';

export interface SkillPointState {
  totalPointsEarned: number;
  totalPointsSpent: number;
  availablePoints: number;
  allocations: Record<string, number>;
  unlockedActions: string[];
  trees: Record<string, TalentNodeDefinition[]>;
}

export async function getSkillPointState() {
  return fetchApi<SkillPointState>('/api/v1/skillpoints');
}

export async function allocateSkillPoint(nodeId: string) {
  return fetchApi<SkillPointState>('/api/v1/skillpoints/allocate', {
    method: 'POST',
    body: JSON.stringify({ nodeId }),
  });
}

export async function respecSkillPoints() {
  return fetchApi<SkillPointState>('/api/v1/skillpoints/respec', { method: 'POST' });
}
