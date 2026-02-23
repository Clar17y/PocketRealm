/** Inflate a base turn cost by guild tax rate (for fixed-cost activities). */
export function inflateCost(baseCost: number, taxRate: number): number {
  return taxRate > 0 ? Math.ceil(baseCost / (1 - taxRate / 100)) : baseCost;
}

/** Calculate effective turns after guild tax deduction (for variable-turn activities). */
export function effectiveTurns(turns: number, taxRate: number): number {
  return taxRate > 0 ? Math.floor(turns * (1 - taxRate / 100)) : turns;
}
