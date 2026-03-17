import type { HpState } from './hp.types';
import type { PlayerBuffData } from './shop.types';

/** Mirrors the frontend InventoryItem shape (apps/web/src/lib/api/items.ts:22-34) */
export interface InventoryItemDTO {
  id: string;
  templateId: string;
  ownerId: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  currentDurability: number | null;
  maxDurability: number | null;
  quantity: number;
  bonusStats: Record<string, number> | null;
  createdAt: string;
  template: {
    id: string;
    name: string;
    itemType: string;
    weightClass: 'heavy' | 'medium' | 'light' | null;
    slot: string | null;
    tier: number;
    baseStats: Record<string, unknown>;
    requiredSkill: string | null;
    requiredLevel: number;
    maxDurability: number;
    stackable: boolean;
    sellPrice: number | null;
  };
  equippedSlot: string | null;
}

export interface ResourceStateDTO {
  current: number;
  max: number;
  regenPerSecond: number;
  lastRegenAt: string;
}

export interface SkillStateDTO {
  id: string;
  skillType: string;
  level: number;
  xp: number;
  dailyXpGained: number;
}

export interface BuffStateDTO {
  id: string;
  buffType: string;
  remainingRounds: number;
  value: number;
}

export interface StateUpdates {
  inventoryAdded?: InventoryItemDTO[];
  inventoryRemoved?: string[];
  inventoryUpdated?: InventoryItemDTO[];
  equipment?: Record<string, InventoryItemDTO | null>;
  skills?: SkillStateDTO[];
  resources?: { stamina: ResourceStateDTO; mana: ResourceStateDTO };
  hp?: HpState;
  gold?: number;
  buffs?: PlayerBuffData[];
  inventoryCapacity?: number;
  inventoryUsedSlots?: number;
  materialTotals?: Record<string, number>;
  characterProgression?: {
    characterXp: number;
    characterLevel: number;
    attributePoints: number;
  };
}
