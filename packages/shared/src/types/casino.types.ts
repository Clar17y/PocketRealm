export type RouletteBetType =
  | 'straight'
  | 'split'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'dozen'
  | 'column'
  | 'corner';

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
const BLACK_SET = new Set<number>(ROULETTE_BLACK_NUMBERS);

export function getNumberColor(n: number): 'red' | 'black' | 'green' {
  if (n === 0) return 'green';
  return RED_SET.has(n) ? 'red' : 'black';
}

export function getNumbersForBet(betType: RouletteBetType, betValue: string): Set<number> {
  switch (betType) {
    case 'straight': return new Set([parseInt(betValue, 10)]);
    case 'split': return new Set(betValue.split(',').map(Number));
    case 'red': return new Set(RED_SET);
    case 'black': return new Set(BLACK_SET);
    case 'odd': return new Set(Array.from({ length: 18 }, (_, i) => i * 2 + 1));
    case 'even': return new Set(Array.from({ length: 18 }, (_, i) => (i + 1) * 2));
    case 'dozen': {
      if (betValue === '1-12') return new Set(Array.from({ length: 12 }, (_, i) => i + 1));
      if (betValue === '13-24') return new Set(Array.from({ length: 12 }, (_, i) => i + 13));
      if (betValue === '25-36') return new Set(Array.from({ length: 12 }, (_, i) => i + 25));
      return new Set();
    }
    case 'column': {
      const col = parseInt(betValue.replace('col', ''), 10);
      return new Set(Array.from({ length: 12 }, (_, i) => i * 3 + col));
    }
    case 'corner': {
      const nums = betValue.split(',').map(Number);
      return new Set(nums);
    }
    default: return new Set();
  }
}

export interface CasinoPhaseEvent {
  phase: 'betting' | 'spinning' | 'result';
  roundId: string;
  timeRemainingMs: number;
  result?: number;
  bets?: RoulettePublicBet[];
}

export interface CasinoBetEvent {
  playerName: string;
  betType: RouletteBetType;
  betValue: string;
  amount: number;
}

export interface CasinoWinningBet {
  playerName: string;
  betType: RouletteBetType;
  betValue: string;
  amount: number;
  payout: number;
}

export interface CasinoResultEvent {
  result: number;
  color: 'red' | 'black' | 'green';
  winningBets: CasinoWinningBet[];
}
