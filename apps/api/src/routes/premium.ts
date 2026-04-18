import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  confirmSupportPocketrealmCheckoutSession,
  getPremiumStatus,
  listPremiumPurchases,
} from '../services/premiumService';
import { createSupportPocketrealmCheckoutSession } from '../services/stripeService';

export const premiumRouter = Router();

premiumRouter.use(authenticate);

premiumRouter.post('/checkout', asyncHandler(async (req, res) => {
  const session = await createSupportPocketrealmCheckoutSession({
    playerId: req.player!.playerId,
  });

  res.json(session);
}));

const confirmCheckoutSchema = z.object({
  sessionId: z.string().min(1),
});

premiumRouter.post('/confirm', asyncHandler(async (req, res) => {
  const body = confirmCheckoutSchema.parse(req.body);
  const premium = await confirmSupportPocketrealmCheckoutSession({
    playerId: req.player!.playerId,
    sessionId: body.sessionId,
  });

  res.json({ premium });
}));

premiumRouter.get('/status', asyncHandler(async (req, res) => {
  const premium = await getPremiumStatus(req.player!.playerId);
  res.json({ premium });
}));

premiumRouter.get('/purchases', asyncHandler(async (req, res) => {
  const purchases = await listPremiumPurchases(req.player!.playerId);
  res.json({ purchases });
}));
