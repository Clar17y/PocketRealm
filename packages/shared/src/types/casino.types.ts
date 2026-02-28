export type RouletteBetType =
  | 'straight'
  | 'split'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'dozen'
  | 'column';

export interface RouletteRoundState {
  roundId: string;
  phase: 'betting' | 'spinning' | 'result' | 'idle';
  result: number | null;
  startedAt: string;
  timeRemainingMs: number;
  bets: RoulettePublicBet[];
}

export interface RoulettePublicBet {
  playerName: string;
  betType: RouletteBetType;
  betValue: string;
  amount: number;
}

export interface RouletteHistoryEntry {
  spinNumber: number;
  result: number;
  resolvedAt: string;
}

export const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36] as const;
export const ROULETTE_BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35] as const;

const RED_SET = new Set<number>(ROULETTE_RED_NUMBERS);

export function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED_SET.has(n) ? 'red' : 'black';
}
