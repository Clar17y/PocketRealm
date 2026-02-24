import { TIER_BLEED_CONSTANTS, ZONE_EXPLORATION_CONSTANTS } from '@adventure/shared';

interface MobWithTier {
  id: string;
  explorationTier: number;
  encounterWeight: number;
  [key: string]: unknown;
}

export function filterAndWeightMobsByTier<T extends MobWithTier>(
  mobs: T[],
  explorationPercent: number,
  zoneTiers: Record<string, number> | null,
): (T & { encounterWeight: number })[] {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;

  let highestUnlockedTier = 0;
  for (const [tierStr, threshold] of Object.entries(tiers)) {
    const tier = Number(tierStr);
    if (explorationPercent >= threshold && tier > highestUnlockedTier) {
      highestUnlockedTier = tier;
    }
  }

  if (highestUnlockedTier === 0) return [];

  const filtered = mobs.filter(m => {
    const tierThreshold = tiers[String(m.explorationTier)];
    return tierThreshold !== undefined && explorationPercent >= tierThreshold;
  });

  if (filtered.length === 0) return [];

  const hasMultipleTiers = new Set(filtered.map(m => m.explorationTier)).size > 1;
  const multiplier = ZONE_EXPLORATION_CONSTANTS.NEWEST_TIER_WEIGHT_MULTIPLIER;

  return filtered.map(m => ({
    ...m,
    encounterWeight: hasMultipleTiers && m.explorationTier === highestUnlockedTier
      ? m.encounterWeight * multiplier
      : m.encounterWeight,
  }));
}

export function selectTierWithBleedthrough(
  selectedTier: number,
  zoneTiers: Record<string, number> | null,
  rng: () => number = Math.random,
): number {
  const tiers = zoneTiers ?? ZONE_EXPLORATION_CONSTANTS.DEFAULT_TIERS;
  const tierNumbers = Object.keys(tiers).map(Number).filter(n => !isNaN(n));
  const maxTier = Math.max(...tierNumbers, 0);
  const minTier = Math.min(...tierNumbers, maxTier);
  if (maxTier <= 0) return selectedTier;

  const { TWO_BELOW, ONE_BELOW, SELECTED, ONE_ABOVE } = TIER_BLEED_CONSTANTS;
  const roll = rng();

  let targetTier: number;
  if (roll < TWO_BELOW) {
    targetTier = selectedTier - 2;
  } else if (roll < TWO_BELOW + ONE_BELOW) {
    targetTier = selectedTier - 1;
  } else if (roll < TWO_BELOW + ONE_BELOW + SELECTED) {
    targetTier = selectedTier;
  } else if (roll < TWO_BELOW + ONE_BELOW + SELECTED + ONE_ABOVE) {
    targetTier = selectedTier + 1;
  } else {
    targetTier = selectedTier + 2;
  }

  // Redistribute unavailable tiers:
  // Below-range overflow → selected tier
  // Above-range overflow → highest available tier
  if (targetTier < minTier) return selectedTier;
  if (targetTier > maxTier) return maxTier;
  return targetTier;
}
