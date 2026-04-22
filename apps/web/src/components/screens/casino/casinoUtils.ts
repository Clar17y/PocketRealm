import type { RouletteBetType, RoulettePublicBet } from '@pocketrealm/shared';

export interface ChipStack {
  myAmount: number;
  myCount: number;
  otherCount: number;
}

export interface SelectedRouletteBet {
  type: RouletteBetType;
  value: string;
}

export type CasinoChipMap = Map<string, ChipStack>;

export function colorClass(color: 'red' | 'black' | 'green'): string {
  switch (color) {
    case 'red':
      return 'bg-[var(--rpg-red)] text-white';
    case 'black':
      return 'bg-[#1a1a2e] text-white';
    case 'green':
      return 'bg-[var(--rpg-green-dark)] text-white';
  }
}

export function colorPipClass(color: 'red' | 'black' | 'green'): string {
  switch (color) {
    case 'red':
      return 'bg-[var(--rpg-red)]';
    case 'black':
      return 'bg-[#1a1a2e]';
    case 'green':
      return 'bg-[var(--rpg-green-dark)]';
  }
}

export const BOARD_ROWS: number[][] = Array.from({ length: 12 }, (_, row) => [
  row * 3 + 1,
  row * 3 + 2,
  row * 3 + 3,
]);

export const CORNER_POSITIONS: { row: number; col: number; value: string; numbers: number[] }[] = Array.from(
  { length: 11 },
  (_, row) => {
    const topLeft = row * 3 + 1;

    return [
      {
        row,
        col: 0,
        value: `${topLeft},${topLeft + 1},${topLeft + 3},${topLeft + 4}`,
        numbers: [topLeft, topLeft + 1, topLeft + 3, topLeft + 4],
      },
      {
        row,
        col: 1,
        value: `${topLeft + 1},${topLeft + 2},${topLeft + 4},${topLeft + 5}`,
        numbers: [topLeft + 1, topLeft + 2, topLeft + 4, topLeft + 5],
      },
    ];
  },
).flat();

export function getBetChipKey(betType: RouletteBetType, betValue: string): string {
  if (betType === 'straight') return `num:${betValue}`;
  if (betType === 'corner') return `corner:${betValue}`;
  return `${betType}:${betValue}`;
}

export function buildChipMap(displayBets: RoulettePublicBet[], playerName: string | null): CasinoChipMap {
  const chipMap: CasinoChipMap = new Map();

  for (const bet of displayBets) {
    const key = getBetChipKey(bet.betType, bet.betValue);
    const isMine = bet.playerName === playerName;
    const current = chipMap.get(key) ?? { myAmount: 0, myCount: 0, otherCount: 0 };

    if (isMine) {
      current.myAmount += bet.amount;
      current.myCount += 1;
    } else {
      current.otherCount += 1;
    }

    chipMap.set(key, current);
  }

  return chipMap;
}

export function formatBet(type: RouletteBetType, value: string): string {
  switch (type) {
    case 'straight':
      return `#${value}`;
    case 'red':
      return 'Red';
    case 'black':
      return 'Black';
    case 'odd':
      return 'Odd';
    case 'even':
      return 'Even';
    case 'dozen':
      return value === '1-12' ? '1st 12' : value === '13-24' ? '2nd 12' : '3rd 12';
    case 'column':
      return `Column ${value.replace('col', '')}`;
    case 'corner':
      return `Corner ${value}`;
    case 'split':
      return `Split ${value}`;
    default:
      return `${type} ${value}`;
  }
}
