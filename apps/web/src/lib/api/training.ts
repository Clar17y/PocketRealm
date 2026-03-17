import { fetchApi } from './core';
import type { StateUpdates } from '@pocketrealm/shared';
import type { CombatLogEntryResponse } from './combat';

export interface TrainingCombatResult {
  outcome: 'victory' | 'defeat' | 'fled' | 'draw';
  log: CombatLogEntryResponse[];
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  combatantAHpRemaining: number;
  combatantBHpRemaining: number;
  combatantAMaxStamina: number;
  combatantBMaxStamina: number;
  combatantAStaminaRemaining: number;
  combatantAMaxMana: number;
  combatantBMaxMana: number;
  combatantAManaRemaining: number;
  potionsConsumed: Array<{ tier: number; healAmount: number; round: number; templateId?: string }>;
  totalRounds: number;
}

export interface TrainingFightResponse {
  combat: TrainingCombatResult;
  cooldownSeconds: number;
  stateUpdates?: StateUpdates;
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
