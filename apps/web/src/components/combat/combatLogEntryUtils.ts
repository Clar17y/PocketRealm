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
    entry.hitChance !== undefined &&
    entry.hitRollValue !== undefined &&
    entry.attackerHitScore !== undefined &&
    entry.defenderAvoidScore !== undefined
  ) {
    const result = entry.hitRollValue < entry.hitChance ? 'Hit' : 'Miss';
    return `${(entry.hitChance * 100).toFixed(2)}% chance `
      + `(${entry.attackerHitScore} hit vs ${entry.defenderAvoidScore} avoid), `
      + `sample ${entry.hitRollValue.toFixed(2)} => ${result}`;
  }

  return null;
}
