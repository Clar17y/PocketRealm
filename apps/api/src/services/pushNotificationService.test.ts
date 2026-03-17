import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subscribe, unsubscribe, getSubscriptionStatus, sendPush } from './pushNotificationService';

// Mock Prisma
vi.mock('@pocketrealm/database', () => ({
  prisma: {
    pushSubscription: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import { prisma } from '@pocketrealm/database';
import webpush from 'web-push';

const PLAYER_ID = 'player-1';
const SUBSCRIPTION = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/test',
  keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
};

describe('pushNotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'test-public';
    process.env.VAPID_PRIVATE_KEY = 'test-private';
    process.env.VAPID_SUBJECT = 'mailto:test@example.com';
  });

  describe('subscribe', () => {
    it('upserts a push subscription', async () => {
      vi.mocked(prisma.pushSubscription.upsert).mockResolvedValue({} as never);
      await subscribe(PLAYER_ID, SUBSCRIPTION);
      expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith({
        where: {
          playerId_endpoint: { playerId: PLAYER_ID, endpoint: SUBSCRIPTION.endpoint },
        },
        create: {
          playerId: PLAYER_ID,
          endpoint: SUBSCRIPTION.endpoint,
          p256dh: SUBSCRIPTION.keys.p256dh,
          auth: SUBSCRIPTION.keys.auth,
        },
        update: {
          p256dh: SUBSCRIPTION.keys.p256dh,
          auth: SUBSCRIPTION.keys.auth,
        },
      });
    });
  });

  describe('unsubscribe', () => {
    it('deletes subscriptions for player', async () => {
      vi.mocked(prisma.pushSubscription.deleteMany).mockResolvedValue({ count: 1 });
      await unsubscribe(PLAYER_ID, SUBSCRIPTION.endpoint);
      expect(prisma.pushSubscription.deleteMany).toHaveBeenCalledWith({
        where: { playerId: PLAYER_ID, endpoint: SUBSCRIPTION.endpoint },
      });
    });
  });

  describe('getSubscriptionStatus', () => {
    it('returns true when subscription exists', async () => {
      vi.mocked(prisma.pushSubscription.findFirst).mockResolvedValue({} as never);
      const status = await getSubscriptionStatus(PLAYER_ID);
      expect(status).toBe(true);
    });

    it('returns false when no subscription', async () => {
      vi.mocked(prisma.pushSubscription.findFirst).mockResolvedValue(null);
      const status = await getSubscriptionStatus(PLAYER_ID);
      expect(status).toBe(false);
    });
  });

  describe('sendPush', () => {
    it('sends notification to all player subscriptions', async () => {
      const subs = [
        { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
        { id: 's2', endpoint: 'https://push.example.com/2', p256dh: 'key2', auth: 'auth2' },
      ];
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs as never);
      vi.mocked(webpush.sendNotification).mockResolvedValue({} as never);

      await sendPush(PLAYER_ID, { title: 'Test', body: 'Hello' });

      expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('removes expired subscriptions on 410', async () => {
      const subs = [
        { id: 's1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
      ];
      vi.mocked(prisma.pushSubscription.findMany).mockResolvedValue(subs as never);

      const error = new Error('Gone') as Error & { statusCode: number };
      error.statusCode = 410;
      vi.mocked(webpush.sendNotification).mockRejectedValue(error);

      await sendPush(PLAYER_ID, { title: 'Test', body: 'Hello' });

      expect(prisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });
  });
});
