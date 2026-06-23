import type { ItemStats } from './item.types';
import type { StateUpdates } from './stateUpdates.types';

export type VexExchangeCategory = 'item' | 'upgrade' | 'service' | 'boss_stone';

export interface VexRequiredItem {
  itemTemplateName: string;
  quantity: number;
  ownedQuantity: number;
}

export interface VexTargetOption {
  itemId: string;
  itemName: string;
  slot: string | null;
  rarity: string;
  currentDurability: number | null;
  maxDurability: number | null;
  alreadyApplied: boolean;
  baseStats: ItemStats;
  bonusStats: ItemStats | null;
}

export interface VexExchangeView {
  key: string;
  name: string;
  description: string;
  category: VexExchangeCategory;
  goldCost: number;
  playerGold: number;
  requiredItems: VexRequiredItem[];
  targetOptions: VexTargetOption[];
  canPurchase: boolean;
  blockedReason: string | null;
  sortOrder: number;
}

export interface VexExchangeListResponse {
  exchanges: VexExchangeView[];
  gold: number;
}

export interface VexPurchaseResponse {
  exchangeKey: string;
  message: string;
  stateUpdates?: StateUpdates;
}
