export interface GatheringResultDetailsInput {
  levelMultiplier: number;
  guildAndBuffBonus: number;
  championMultiplier: number;
  eventMultiplier: number;
  unclampedRawYield: number;
  rawTotalYield: number;
  totalYield: number;
  effectiveCapacity: number;
}

export interface GatheringResultDetails {
  levelMultiplier: number;
  bonusMultiplier: number;
  championMultiplier: number;
  totalMultiplier: number;
  eventMultiplier: number;
  unclampedRawYield: number;
  rawTotalYield: number;
  totalYield: number;
  effectiveCapacity: number;
  capacityLimited: boolean;
}

export function buildGatheringResultDetails(input: GatheringResultDetailsInput): GatheringResultDetails {
  const bonusMultiplier = 1 + input.guildAndBuffBonus;

  return {
    levelMultiplier: input.levelMultiplier,
    bonusMultiplier,
    championMultiplier: input.championMultiplier,
    totalMultiplier: input.levelMultiplier * bonusMultiplier * input.championMultiplier,
    eventMultiplier: input.eventMultiplier,
    unclampedRawYield: input.unclampedRawYield,
    rawTotalYield: input.rawTotalYield,
    totalYield: input.totalYield,
    effectiveCapacity: input.effectiveCapacity,
    capacityLimited: input.unclampedRawYield > input.effectiveCapacity,
  };
}
