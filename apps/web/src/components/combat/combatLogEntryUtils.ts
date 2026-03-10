type HitBreakdownEntry = {
  roll?: number;
  accuracyModifier?: number;
  targetDodge?: number;
  targetEvasion?: number;
  hitChance?: number;
  hitRollValue?: number;
  attackerHitScore?: number;
  defenderAvoidScore?: number;
};

function resolveLegacyHitOutcome(entry: HitBreakdownEntry): {
  result: 'Hit' | 'Miss';
  threshold: number;
  evasionContribution: number;
} | null {
  if (entry.roll === undefined || entry.targetDodge === undefined) {
    return null;
  }

  const evasionContribution = Math.floor((entry.targetEvasion ?? 0) / 2);
  const threshold = 10 + entry.targetDodge + evasionContribution;
  const total = entry.roll + (entry.accuracyModifier ?? 0);

  if (entry.roll === 1) {
    return { result: 'Miss', threshold, evasionContribution };
  }
  if (entry.roll === 20) {
    return { result: 'Hit', threshold, evasionContribution };
  }

  return { result: total >= threshold ? 'Hit' : 'Miss', threshold, evasionContribution };
}

export function formatHitBreakdown(entry: HitBreakdownEntry): string | null {
  if (entry.roll === undefined) {
    return null;
  }

  if (
    entry.hitChance !== undefined &&
    entry.hitRollValue !== undefined &&
    entry.attackerHitScore !== undefined &&
    entry.defenderAvoidScore !== undefined
  ) {
    const result = entry.hitRollValue < entry.hitChance ? 'Hit' : 'Miss';
    return `Roll: ${entry.roll}${entry.accuracyModifier !== undefined ? ` + ${entry.accuracyModifier} ACC` : ''} | `
      + `${(entry.hitChance * 100).toFixed(1)}% chance `
      + `(${entry.attackerHitScore} hit vs ${entry.defenderAvoidScore} avoid), `
      + `sample ${entry.hitRollValue.toFixed(2)} => ${result}`;
  }

  const legacy = resolveLegacyHitOutcome(entry);
  if (!legacy) {
    return null;
  }

  return `Roll: ${entry.roll}`
    + `${entry.accuracyModifier !== undefined ? ` + ${entry.accuracyModifier} ACC` : ''}`
    + ` vs ${legacy.threshold} (10 + ${entry.targetDodge} DOD + ${legacy.evasionContribution} EVA) => ${legacy.result}`;
}
