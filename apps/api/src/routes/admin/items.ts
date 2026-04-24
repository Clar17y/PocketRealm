import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { listAdminItemTemplates, grantAdminItem } from '../../services/admin/itemAdminService';

const grantItemSchema = z.object({
  templateId: z.string().min(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).default('common'),
  quantity: z.number().int().min(1).max(1000).default(1),
});

export function registerItemAdminRoutes(router: Router): void {
  router.get('/items/templates', asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    const templates = await listAdminItemTemplates({ search, type });
    res.json({ templates });
  }));

  router.post('/items/grant', asyncHandler(async (req, res) => {
    const body = grantItemSchema.parse(req.body);
    const result = await grantAdminItem(req.player!.playerId, body);
    res.json({ success: true, ...result });
  }));
}
