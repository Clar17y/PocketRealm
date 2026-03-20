'use client';

import { useState, useEffect, useCallback } from 'react';
import { getNotificationStatus, subscribePush, unsubscribePush } from '@/lib/api/notifications';
import { trackEvent } from '@/lib/analytics';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export type PushState = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed';

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('loading');
  const [vapidKey, setVapidKey] = useState<string | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    getNotificationStatus().then((res) => {
      if (res.data) {
        setVapidKey(res.data.vapidPublicKey);
        setState(res.data.subscribed ? 'subscribed' : 'unsubscribed');
      }
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!vapidKey) return;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setState('denied');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });

    const json = subscription.toJSON();
    await subscribePush(json);
    setState('subscribed');
    trackEvent('push_subscribe');
  }, [vapidKey]);

  const unsubscribe = useCallback(async () => {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await unsubscribePush(subscription.endpoint);
      await subscription.unsubscribe();
    }
    setState('unsubscribed');
  }, []);

  const toggle = useCallback(async () => {
    if (state === 'subscribed') {
      await unsubscribe();
    } else {
      await subscribe();
    }
  }, [state, subscribe, unsubscribe]);

  return { state, toggle };
}
