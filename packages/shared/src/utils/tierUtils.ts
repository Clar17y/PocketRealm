import { ZONE_EXPLORATION_CONSTANTS, TIER_NAME_CONSTANTS } from '../constants/gameConstants';

/** Resolve zone tiers, falling back to defaults if null. */
export function resolveZoneTiers(zoneTiers: Record<string, number> | null): Record<string, number> {
  return zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;
}

/** Get all unlocked tier numbers for a given exploration percent, sorted ascending. */
export function getUnlockedTiers(
  explorationPercent: number,
  zoneTiers: Record<string, number> | null,
): number[] {
  const tiers = resolveZoneTiers(zoneTiers);
  return Object.entries(tiers)
    .filter(([, threshold]) => explorationPercent >= threshold)
    .map(([tier]) => Number(tier))
    .sort((a, b) => a - b);
}

/** Get a thematic display name for an exploration tier number. */
export function getTierName(tier: number): string {
  return TIER_NAME_CONSTANTS.NAMES[tier] ?? `Tier ${tier}`;
}

/** Get the highest unlocked tier for a given exploration percent. Returns 0 if none unlocked. */
export function getHighestUnlockedTier(
  explorationPercent: number,
  zoneTiers: Record<string, number> | null,
): number {
  const unlocked = getUnlockedTiers(explorationPercent, zoneTiers);
  return unlocked.length > 0 ? unlocked[unlocked.length - 1]! : 0;
}
