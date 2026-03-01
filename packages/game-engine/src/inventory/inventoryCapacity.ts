import { INVENTORY_CONSTANTS, ITEM_RARITY_CONSTANTS } from '@adventure/shared';
import type { ItemRarity } from '@adventure/shared';

const RARITY_INDEX: Record<string, number> = {};
ITEM_RARITY_CONSTANTS.ORDER.forEach((r, i) => { RARITY_INDEX[r] = i; });

export function getBackpackSlots(tier: number, rarity: ItemRarity): number {
  if (tier <= 0) return 0;
  const base = tier * INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_TIER;
  const rarityBonus = (RARITY_INDEX[rarity] ?? 0) * INVENTORY_CONSTANTS.BACKPACK_SLOTS_PER_RARITY;
  return base + rarityBonus;
}

export interface CapacityInput {
  backpackTier: number;
  backpackRarity: ItemRarity;
  beltSlotBonus: number;
  isChampion: boolean;
}

export function getInventoryCapacity(input: CapacityInput): number {
  return (
    INVENTORY_CONSTANTS.BASE_CAPACITY +
    getBackpackSlots(input.backpackTier, input.backpackRarity) +
    input.beltSlotBonus +
    (input.isChampion ? INVENTORY_CONSTANTS.CHAMPION_BONUS_SLOTS : 0)
  );
}
