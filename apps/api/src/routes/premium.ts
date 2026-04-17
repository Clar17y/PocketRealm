import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getPremiumStatus, listPremiumPurchases } from '../services/premiumService';
import { createSupportPocketrealmCheckoutSession } from '../services/stripeService';

export const premiumRouter = Router();

premiumRouter.use(authenticate);

premiumRouter.post('/checkout', asyncHandler(async (req, res) => {
  const session = await createSupportPocketrealmCheckoutSession({
    playerId: req.player!.playerId,
  });

  res.json({
    sessionId: session.id,
    checkoutUrl: session.url,
  });
}));

premiumRouter.get('/status', asyncHandler(async (req, res) => {
  const premium = await getPremiumStatus(req.player!.playerId);
  res.json({ premium });
}));

premiumRouter.get('/purchases', asyncHandler(async (req, res) => {
  const purchases = await listPremiumPurchases(req.player!.playerId);
  res.json({ purchases });
}));
