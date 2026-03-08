import { fetchApi } from './core';
import type { ShopItemData, PlayerBuffData, ShopPurchaseResult } from '@pocketrealm/shared';

export interface ShopListResponse {
  items: ShopItemData[];
  questTokens: number;
}

export interface BuffsResponse {
  buffs: PlayerBuffData[];
}

export async function getShopItems() {
  return fetchApi<ShopListResponse>('/api/v1/shop');
}

export async function purchaseShopItem(itemId: string, params?: {
  targetZoneId?: string;
  targetMobTemplateId?: string;
  targetContractId?: string;
}) {
  return fetchApi<ShopPurchaseResult>(`/api/v1/shop/purchase/${itemId}`, {
    method: 'POST',
    body: params ? JSON.stringify(params) : undefined,
  });
}

export async function getPlayerBuffs() {
  return fetchApi<BuffsResponse>('/api/v1/player/buffs');
}
