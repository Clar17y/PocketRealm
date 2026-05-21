import type { CraftMarks } from '@pocketrealm/shared';

export interface InventoryItem {
  id: string;
  name: string;
  icon?: string;
  imageSrc?: string;
  quantity: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  description: string;
  type: string;
  weightClass?: 'heavy' | 'medium' | 'light' | null;
  tier?: number;
  slot?: string | null;
  equippedSlot?: string | null;
  durability?: { current: number; max: number } | null;
  baseStats?: Record<string, unknown>;
  bonusStats?: Record<string, unknown> | null;
  craftMarks?: CraftMarks | null;
  requiredSkill?: string | null;
  requiredLevel?: number | null;
  salvageCost: number | null;
  sellPrice?: number | null;
}

export interface InventoryStashItem {
  id: string;
  name: string;
  imageSrc?: string;
  quantity: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  type: string;
  durability?: { current: number; max: number } | null;
  craftMarks?: CraftMarks | null;
  sellPrice: number | null;
  salvageCost: number | null;
}
