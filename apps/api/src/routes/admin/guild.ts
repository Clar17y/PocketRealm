import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  fillAdminExpedition,
  grantAdminGuildTreasury,
  resetAdminExpeditionCooldowns,
} from '../../services/admin/guildAdminService';

const grantTreasurySchema = z.object({
  amount: z.number().int().min(1).max(10_000_000),
});

export function registerGuildAdminRoutes(router: Router): void {
  router.post('/guild/treasury', asyncHandler(async (req, res) => {
    const { amount } = grantTreasurySchema.parse(req.body);
    const result = await grantAdminGuildTreasury(req.player!.playerId, amount);
    res.json({ success: true, ...result });
  }));

  router.post('/expedition/reset-cooldowns', asyncHandler(async (req, res) => {
    const result = await resetAdminExpeditionCooldowns(req.player!.playerId);
    res.json({ success: true, ...result });
  }));

  router.post('/expedition/fill', asyncHandler(async (req, res) => {
    const result = await fillAdminExpedition(req.player!.playerId);
    res.json(result);
  }));
}
