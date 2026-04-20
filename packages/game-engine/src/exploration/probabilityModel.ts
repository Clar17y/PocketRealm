import { EXPLORATION_CONSTANTS, WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';

export type ExplorationOutcomeType =
  | 'ambush'
  | 'encounter_site'
  | 'resource_node'
  | 'hidden_cache'
  | 'zone_exit'
  | 'event_discovery';

export interface ExplorationOutcome {
  type: ExplorationOutcomeType;
  turnOccurred: number;
}

export interface ExplorationEstimate {
  turns: number;
  ambushChance: number;
  encounterSiteChance: number;
  resourceNodeChance: number;
  hiddenCacheChance: number;
  zoneExitChance: number;
  expectedAmbushes: number;
  expectedEncounterSites: number;
}

/**
 * Calculate cumulative probability for an event occurring
 * over N turns, given per-turn probability p.
 *
 * Formula: 1 - (1 - p)^n
 */
export function cumulativeProbability(perTurnChance: number, turns: number): number {
  if (turns <= 0) return 0;
  if (perTurnChance <= 0) return 0;
  if (perTurnChance >= 1) return 1;

  return 1 - Math.pow(1 - perTurnChance, turns);
}

/**
 * Estimate outcomes for a given number of exploration turns.
 */
export function estimateExploration(
  turns: number,
  zoneExitChance: number | null = null,
  spawnRateMultiplier: number = 1,
  hiddenCacheChanceOverride: number | null = null,
): ExplorationEstimate {
  const ambushRate = EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN * spawnRateMultiplier;
  const siteRate = EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN * spawnRateMultiplier;
  const hiddenCacheChance = hiddenCacheChanceOverride != null
    ? hiddenCacheChanceOverride
    : EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE;
  return {
    turns,
    ambushChance: cumulativeProbability(ambushRate, turns),
    encounterSiteChance: cumulativeProbability(siteRate, turns),
    resourceNodeChance: cumulativeProbability(
      EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE,
      turns
    ),
    hiddenCacheChance: cumulativeProbability(
      hiddenCacheChance,
      turns
    ),
    zoneExitChance: zoneExitChance != null && zoneExitChance > 0
      ? cumulativeProbability(zoneExitChance, turns)
      : 0,
    expectedAmbushes: turns * ambushRate,
    expectedEncounterSites: turns * siteRate,
  };
}

/**
 * Simulate exploration and determine what was discovered.
 * Returns list of outcomes in order they occurred.
 */
export function simulateExploration(
  turns: number,
  zoneExitChance: number | null = null,
  spawnRateMultiplier: number = 1,
  hiddenCacheChanceOverride: number | null = null,
): ExplorationOutcome[] {
  const outcomes: ExplorationOutcome[] = [];
  let canDiscoverZoneExit = zoneExitChance != null && zoneExitChance > 0;
  let canDiscoverEvent = true;
  const ambushChance = EXPLORATION_CONSTANTS.AMBUSH_CHANCE_PER_TURN * spawnRateMultiplier;
  const siteChance = EXPLORATION_CONSTANTS.ENCOUNTER_SITE_CHANCE_PER_TURN * spawnRateMultiplier;
  const hiddenCacheChance = hiddenCacheChanceOverride != null
    ? hiddenCacheChanceOverride
    : EXPLORATION_CONSTANTS.HIDDEN_CACHE_CHANCE;

  for (let t = 1; t <= turns; t++) {
    if (Math.random() < ambushChance) {
      outcomes.push({ type: 'ambush', turnOccurred: t });
    }

    if (Math.random() < siteChance) {
      outcomes.push({ type: 'encounter_site', turnOccurred: t });
    }

    if (Math.random() < EXPLORATION_CONSTANTS.RESOURCE_NODE_CHANCE) {
      outcomes.push({ type: 'resource_node', turnOccurred: t });
    }

    if (Math.random() < hiddenCacheChance) {
      outcomes.push({ type: 'hidden_cache', turnOccurred: t });
    }

    if (canDiscoverZoneExit && Math.random() < zoneExitChance!) {
      outcomes.push({ type: 'zone_exit', turnOccurred: t });
      canDiscoverZoneExit = false;
    }

    if (canDiscoverEvent && Math.random() < WORLD_EVENT_CONSTANTS.EVENT_DISCOVERY_CHANCE_PER_TURN) {
      outcomes.push({ type: 'event_discovery', turnOccurred: t });
      canDiscoverEvent = false;
    }
  }

  return outcomes.sort((a, b) => a.turnOccurred - b.turnOccurred);
}

export interface TravelAmbushOutcome {
  turnOccurred: number;
}

export function simulateTravelAmbushes(turns: number): TravelAmbushOutcome[] {
  const outcomes: TravelAmbushOutcome[] = [];
  for (let t = 1; t <= turns; t++) {
    if (Math.random() < EXPLORATION_CONSTANTS.TRAVEL_AMBUSH_CHANCE_PER_TURN) {
      outcomes.push({ turnOccurred: t });
    }
  }
  return outcomes;
}

/**
 * Validate exploration turn amount.
 */
export function validateExplorationTurns(turns: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(turns)) {
    return { valid: false, error: 'Turn amount must be an integer' };
  }
  if (turns < EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS) {
    return {
      valid: false,
      error: `Minimum exploration is ${EXPLORATION_CONSTANTS.MIN_EXPLORATION_TURNS} turns`,
    };
  }
  if (turns > EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS) {
    return {
      valid: false,
      error: `Maximum exploration is ${EXPLORATION_CONSTANTS.MAX_EXPLORATION_TURNS} turns`,
    };
  }
  return { valid: true };
}
