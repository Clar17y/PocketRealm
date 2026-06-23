import { fetchApi } from './core';
import type { VexExchangeListResponse, VexPurchaseResponse } from '@pocketrealm/shared';

export async function getVexExchanges() {
  return fetchApi<VexExchangeListResponse>('/api/v1/vex/exchanges');
}

export async function purchaseVexExchange(exchangeKey: string, params?: { targetItemId?: string }) {
  return fetchApi<VexPurchaseResponse>(`/api/v1/vex/exchanges/${exchangeKey}/purchase`, {
    method: 'POST',
    body: params ? JSON.stringify(params) : undefined,
  });
}
