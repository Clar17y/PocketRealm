import { fetchApi } from './core';
import type { CombatResult } from '@adventure/shared';

export interface TrainingFightResponse {
  combat: CombatResult;
  cooldownSeconds: number;
}

export async function startTrainingFight(mobTemplateId: string, prefix: string | null) {
  return fetchApi<TrainingFightResponse>('/api/v1/training/fight', {
    method: 'POST',
    body: JSON.stringify({ mobTemplateId, prefix }),
  });
}

export interface TrainingCooldownResponse {
  cooldownSeconds: number;
}

export async function getTrainingCooldown() {
  return fetchApi<TrainingCooldownResponse>('/api/v1/training/cooldown');
}
