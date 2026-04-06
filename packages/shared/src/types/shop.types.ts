export interface ShopItemData {
  id: string;
  key: string;
  name: string;
  description: string;
  cost: number;
  category: 'reset' | 'upgrade' | 'buff' | 'utility' | 'prestige';
  weeklyLimit: number | null;
  lifetimeLimit: number | null;
  buffType: string | null;
  buffValue: number | null;
  buffUses: number | null;
  enabled: boolean;
  sortOrder: number;
  // Populated by API for the requesting player
  purchasesThisWeek?: number;
  purchasesLifetime?: number;
  canPurchase?: boolean;
}

export interface PlayerBuffData {
  id: string;
  buffType: string;
  remainingUses: number;
  bonusValue: number;
  shopItemName: string;
  createdAt: string;
}

export interface ShopPurchaseResult {
  success: boolean;
  newBalance: number;
  itemKey: string;
  effect?: Record<string, unknown>;
  stateUpdates?: import('./stateUpdates.types').StateUpdates;
}
