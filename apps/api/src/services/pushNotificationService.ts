import webpush from 'web-push';
import { prisma } from '@pocketrealm/database';

interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

export type NotificationType =
  | 'pvpAttack'
  | 'pvpScout'
  | 'bossAppeared'
  | 'bossKilled'
  | 'turnBankFull'
  | 'expeditionStarted'
  | 'expeditionFinished';

const PREF_COLUMN: Record<NotificationType, string> = {
  pvpAttack: 'notifyPvpAttack',
  pvpScout: 'notifyPvpScout',
  bossAppeared: 'notifyBossAppeared',
  bossKilled: 'notifyBossKilled',
  turnBankFull: 'notifyTurnBankFull',
  expeditionStarted: 'notifyExpeditionStarted',
  expeditionFinished: 'notifyExpeditionFinished',
};

const NOTIFICATION_SELECT = {
  notifyPvpAttack: true,
  notifyPvpScout: true,
  notifyBossAppeared: true,
  notifyBossKilled: true,
  notifyTurnBankFull: true,
  notifyExpeditionStarted: true,
  notifyExpeditionFinished: true,
} as const;

function initVapid(): void {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

let vapidInitialized = false;

function ensureVapid(): void {
  if (!vapidInitialized) {
    initVapid();
    vapidInitialized = true;
  }
}

export async function subscribe(playerId: string, subscription: PushSubscriptionInput): Promise<void> {
  await prisma.pushSubscription.upsert({
    where: {
      playerId_endpoint: { playerId, endpoint: subscription.endpoint },
    },
    create: {
      playerId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    },
  });
}

export async function unsubscribe(playerId: string, endpoint: string): Promise<void> {
  await prisma.pushSubscription.deleteMany({
    where: { playerId, endpoint },
  });
}

export async function getSubscriptionStatus(playerId: string): Promise<boolean> {
  const sub = await prisma.pushSubscription.findFirst({
    where: { playerId },
    select: { id: true },
  });
  return sub !== null;
}

export async function sendPush(
  playerId: string,
  notificationType: NotificationType,
  payload: PushPayload,
): Promise<void> {
  ensureVapid();

  // Check player's notification preference for this type
  const prefColumn = PREF_COLUMN[notificationType] as keyof typeof NOTIFICATION_SELECT;
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: NOTIFICATION_SELECT,
  });
  if (!player || !player[prefColumn]) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { playerId },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });

  if (subs.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/icon-192.png',
    tag: payload.tag,
    data: payload.data,
  });

  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 3600, urgency: 'high' },
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      }
    }),
  );
}
