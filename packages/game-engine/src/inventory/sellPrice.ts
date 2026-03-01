import { SELL_CONSTANTS } from '@adventure/shared';
import type { ItemRarity } from '@adventure/shared';

export interface SellPriceInput {
  baseSellPrice: number | null;
  rarity: ItemRarity;
  currentDurability: number | null;
  maxDurability: number | null;
}

export function calculateSellPrice(input: SellPriceInput): number {
  if (!input.baseSellPrice) return 0;

  const multiplier = SELL_CONSTANTS.RARITY_MULTIPLIERS[input.rarity] ?? 1;
  let price = input.baseSellPrice * multiplier;

  if (input.currentDurability != null && input.maxDurability != null && input.maxDurability > 0) {
    const ratio = input.currentDurability / input.maxDurability;
    if (ratio < SELL_CONSTANTS.DURABILITY_PENALTY_THRESHOLD) {
      price = Math.floor(price * ratio);
    }
  }

  return Math.max(1, price);
}
