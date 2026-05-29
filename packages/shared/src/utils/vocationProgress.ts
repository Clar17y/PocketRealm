import { VOCATION_MASTERY } from '../constants/gameConstants';

const BASE_XP_PER_RANK = 220;
const LINEAR_XP_PER_RANK = 80;
const RANK_EXPONENT = 2.35;

export function getVocationRankForXp(xp: number): number {
  const safeXp = clampWholeNumber(xp);
  let rank = 1;

  while (getVocationXpForRank(rank + 1) <= safeXp) {
    rank += 1;
  }

  return rank;
}

export function getMasteryPointsForRank(rank: number): number {
  return Math.max(0, clampWholeNumber(rank) - 1);
}

export function getVocationXpForRank(rank: number): number {
  const safeRank = clampWholeNumber(rank);

  if (safeRank <= 1) {
    return 0;
  }

  const rankOffset = safeRank - 1;
  return Math.floor(
    BASE_XP_PER_RANK * Math.pow(rankOffset, RANK_EXPONENT)
      + LINEAR_XP_PER_RANK * rankOffset,
  );
}

export function getPartialRespecRefund(spentPoints: number): number {
  return Math.floor(clampWholeNumber(spentPoints) * VOCATION_MASTERY.RESPEC_REFUND_RATE);
}

function clampWholeNumber(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}
