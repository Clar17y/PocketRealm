import { EquipmentSlot, SkillType } from './player.types';

export interface ItemTemplate {
  id: string;
  name: string;
  itemType: ItemType;
  weightClass: WeightClass | null;
  setId?: string | null;
  slot: EquipmentSlot | null;
  tier: number;
  baseStats: ItemStats;
  requiredSkill: SkillType | null;
  requiredLevel: number;
  maxDurability: number;
  stackable: boolean;
  consumableEffect: ConsumableEffect | null;
  sellPrice?: number | null;
}

export type ConsumableEffectType =
  | 'heal_flat'
  | 'heal_percent'
  | 'restore_stamina'
  | 'restore_mana'
  | 'cleanse_magic_dot'
  | 'buff_attack'
  | 'buff_defence';

export interface ConsumableEffect {
  type: ConsumableEffectType;
  value: number;
  /** Duration in rounds (used by buff potions) */
  duration?: number;
}

export interface Item {
  id: string;
  templateId: string;
  ownerId: string;
  rarity: ItemRarity;
  currentDurability: number | null;
  maxDurability: number | null;
  quantity: number;
  bonusStats: ItemStats | null;
  createdAt: Date;
  inStash: boolean;
}

export type ItemType = 'weapon' | 'armor' | 'resource' | 'consumable';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type WeightClass = 'heavy' | 'medium' | 'light';

export interface ItemStats {
  attack?: number;
  magicPower?: number;
  rangedPower?: number;
  accuracy?: number;
  dodge?: number;
  armor?: number;
  magicDefence?: number;
  health?: number;
  luck?: number;
  critChance?: number;  // flat bonus to base 5% (e.g., 0.04 = +4%)
  critDamage?: number;  // flat bonus to base 1.5x (e.g., 0.15 -> 1.65x)
  inventorySlots?: number;
}

export interface DropTableEntry {
  id: string;
  mobTemplateId: string;
  itemTemplateId: string;
  dropChance: number;
  minQuantity: number;
  maxQuantity: number;
}

export interface CraftingRecipe {
  id: string;
  skillType: SkillType;
  requiredLevel: number;
  resultTemplateId: string;
  isAdvanced?: boolean;
  soulbound?: boolean;
  mobFamilyId?: string | null;
  turnCost: number;
  materials: CraftingMaterial[];
  xpReward: number;
}

export interface CraftingMaterial {
  templateId: string;
  quantity: number;
}
