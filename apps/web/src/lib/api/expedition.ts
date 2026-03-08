import { fetchApi } from './core';
import type {
  ExpeditionData,
  ExpeditionMemberData,
  ExpeditionShopItem,
} from '@pocketrealm/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpeditionStatusResponse {
  expedition: ExpeditionData | null;
}

export interface ExpeditionDetailResponse {
  expedition: ExpeditionData;
  members: ExpeditionMemberData[];
}

export interface ExpeditionHistoryResponse {
  expeditions: ExpeditionData[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ExpeditionShopResponse {
  items: ExpeditionShopItem[];
  tokens: number;
}

export interface ExpeditionPurchaseResponse {
  item: {
    id: string;
    name: string;
    slot: string;
    rarity: string;
    isSoulbound: boolean;
  };
  tokensRemaining: number;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

export async function getActiveExpedition() {
  return fetchApi<ExpeditionStatusResponse>('/api/v1/expedition/active');
}

export async function getExpeditionStatus(id: string) {
  return fetchApi<ExpeditionDetailResponse>(`/api/v1/expedition/${id}`);
}

export async function getExpeditionHistory(page = 1) {
  return fetchApi<ExpeditionHistoryResponse>(`/api/v1/expedition/history?page=${page}`);
}

export async function launchExpedition(tier: number) {
  return fetchApi<{ expedition: ExpeditionData }>('/api/v1/expedition/launch', {
    method: 'POST',
    body: JSON.stringify({ tier }),
  });
}

export async function signUpForExpedition(id: string) {
  return fetchApi<{ member: ExpeditionMemberData }>(`/api/v1/expedition/${id}/signup`, {
    method: 'POST',
  });
}

export async function forceStartExpedition(id: string) {
  return fetchApi<{ success: boolean; message: string }>(`/api/v1/expedition/${id}/force-start`, {
    method: 'POST',
  });
}

export async function recoverFromExpeditionKO(id: string) {
  return fetchApi<{ member: ExpeditionMemberData }>(`/api/v1/expedition/${id}/recover`, {
    method: 'POST',
  });
}

export async function getExpeditionShop() {
  return fetchApi<ExpeditionShopResponse>('/api/v1/expedition/shop');
}

export async function purchaseExpeditionItem(itemId: string) {
  return fetchApi<ExpeditionPurchaseResponse>('/api/v1/expedition/shop/purchase', {
    method: 'POST',
    body: JSON.stringify({ itemId }),
  });
}
