import { fetchApi } from './core';

interface NotificationStatus {
  subscribed: boolean;
  vapidPublicKey: string | null;
}

export async function getNotificationStatus() {
  return fetchApi<NotificationStatus>('/api/v1/notifications/status');
}

export async function subscribePush(subscription: PushSubscriptionJSON) {
  return fetchApi<{ success: boolean }>('/api/v1/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
    }),
  });
}

export async function unsubscribePush(endpoint: string) {
  return fetchApi<{ success: boolean }>('/api/v1/notifications/unsubscribe', {
    method: 'DELETE',
    body: JSON.stringify({ endpoint }),
  });
}
