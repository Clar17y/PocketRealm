type HitBreakdownEntry = {
  roll?: number;
  accuracyModifier?: number;
  hitChance?: number;
  hitRollValue?: number;
  attackerHitScore?: number;
  defenderAvoidScore?: number;
};

export function formatHitBreakdown(entry: HitBreakdownEntry): string | null {
  if (
    entry.roll !== undefined &&
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

  return null;
}
