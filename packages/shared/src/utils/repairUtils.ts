import { DURABILITY_CONSTANTS } from '../constants/gameConstants';

const TIER_COSTS = DURABILITY_CONSTANTS.REPAIR_TURN_COST_BY_TIER;
type TierKey = keyof typeof TIER_COSTS;

/** Compute the turn cost to repair a single item by tier. */
export function repairTurnCost(tier: number, isBroken: boolean): number {
  const key = tier as TierKey;
  const baseCost = key in TIER_COSTS ? TIER_COSTS[key] : 100;
  return isBroken
    ? Math.ceil(baseCost * DURABILITY_CONSTANTS.BROKEN_REPAIR_MULTIPLIER)
    : baseCost;
}
