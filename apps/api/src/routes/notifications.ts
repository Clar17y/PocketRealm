import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { subscribe, unsubscribe, getSubscriptionStatus } from '../services/pushNotificationService';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Subscribe to push notifications
notificationsRouter.post('/subscribe', asyncHandler(async (req, res) => {
  const subscription = subscribeSchema.parse(req.body);
  await subscribe(req.player!.playerId, subscription);
  res.json({ success: true });
}));

// Unsubscribe from push notifications
notificationsRouter.delete('/unsubscribe', asyncHandler(async (req, res) => {
  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(req.body);
  await unsubscribe(req.player!.playerId, endpoint);
  res.json({ success: true });
}));

// Check subscription status + get VAPID public key
notificationsRouter.get('/status', asyncHandler(async (req, res) => {
  const subscribed = await getSubscriptionStatus(req.player!.playerId);
  res.json({ subscribed, vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null });
}));
