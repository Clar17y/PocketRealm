import { fetchApi } from './core';
import type {
  RouletteRoundState,
  RouletteBetType,
  RouletteHistoryEntry,
} from '@adventure/shared';

export interface GoldExchangeResponse {
  turnsSpent: number;
  goldGained: number;
  goldBalance: number;
  turnsRemaining: number;
}

export async function exchangeGold(turns: number) {
  return fetchApi<GoldExchangeResponse>('/api/v1/casino/exchange', {
    method: 'POST',
    body: JSON.stringify({ turns }),
  });
}

export async function getRouletteRound() {
  return fetchApi<RouletteRoundState>('/api/v1/casino/roulette/round');
}

export interface PlaceBetResponse {
  roundId: string;
  goldRemaining: number;
}

export async function placeRouletteBet(betType: RouletteBetType, betValue: string, amount: number) {
  return fetchApi<PlaceBetResponse>('/api/v1/casino/roulette/bet', {
    method: 'POST',
    body: JSON.stringify({ betType, betValue, amount }),
  });
}

export async function getRouletteHistory() {
  return fetchApi<{ history: RouletteHistoryEntry[] }>('/api/v1/casino/roulette/history');
}
