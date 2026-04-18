import { fetchApi } from './core';

export async function createPremiumCheckout() {
  return fetchApi<{ id: string; url: string }>('/api/v1/premium/checkout', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function confirmPremiumCheckout(sessionId: string) {
  return fetchApi<{
    premium: {
      isPremium: boolean;
      premiumExpiresAt: string | null;
    };
  }>('/api/v1/premium/confirm', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

export async function getPremiumStatus() {
  return fetchApi<{
    premium: {
      isPremium: boolean;
      premiumExpiresAt: string | null;
    };
  }>('/api/v1/premium/status');
}

export async function getPremiumPurchases() {
  return fetchApi<{
    purchases: Array<{
      id: string;
      amount?: number;
      currency?: string;
      championDaysGranted: number;
      grantedFrom?: string;
      grantedUntil: string;
      createdAt: string;
    }>;
  }>('/api/v1/premium/purchases');
}
