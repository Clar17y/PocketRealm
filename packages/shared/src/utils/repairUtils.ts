import { DURABILITY_CONSTANTS } from '../constants/gameConstants';

/** Compute the turn cost to repair a single item by tier. */
export function repairTurnCost(tier: number, isBroken: boolean): number {
  const baseCost = (DURABILITY_CONSTANTS.REPAIR_TURN_COST_BY_TIER as Record<number, number>)[tier] ?? 100;
  return isBroken
    ? Math.ceil(baseCost * DURABILITY_CONSTANTS.BROKEN_REPAIR_MULTIPLIER)
    : baseCost;
}
