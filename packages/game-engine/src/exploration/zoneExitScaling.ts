import { EXPLORATION_CONSTANTS } from '@adventure/shared';

export function getScaledZoneExitChance(baseChance: number, explorationPercent: number): number {
  if (baseChance <= 0) return 0;

  const { ZONE_EXIT_SCALING_START, ZONE_EXIT_SCALING_MAX_MULTIPLIER } = EXPLORATION_CONSTANTS;

  if (explorationPercent <= ZONE_EXIT_SCALING_START) return baseChance;

  const progress = Math.min(
    (explorationPercent - ZONE_EXIT_SCALING_START) / (100 - ZONE_EXIT_SCALING_START),
    1,
  );
  const multiplier = 1 + (ZONE_EXIT_SCALING_MAX_MULTIPLIER - 1) * progress * progress;

  return baseChance * multiplier;
}
