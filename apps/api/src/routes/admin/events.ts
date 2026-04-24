import { Router } from 'express';
import { z } from 'zod';
import { WORLD_EVENT_TEMPLATES } from '@pocketrealm/shared';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  cancelAdminEvent,
  listAdminMobs,
  listAdminWorldEvents,
  spawnAdminBoss,
  spawnAdminWorldEvent,
} from '../../services/admin/eventAdminService';

const spawnEventSchema = z.object({
  templateIndex: z.number().int().min(0),
  zoneId: z.string().uuid(),
  durationHours: z.number().min(0.1).max(168).default(2),
  target: z.string().min(1).optional(),
});

const spawnBossSchema = z.object({
  mobTemplateId: z.string().uuid(),
  zoneId: z.string().uuid(),
});

export function registerEventAdminRoutes(router: Router): void {
  router.get('/events/templates', (_req, res) => {
    res.json({ templates: WORLD_EVENT_TEMPLATES.map((template, index) => ({ id: index, ...template })) });
  });

  router.get('/events/active', asyncHandler(async (_req, res) => {
    const events = await listAdminWorldEvents();
    res.json({ events });
  }));

  router.post('/events/spawn', asyncHandler(async (req, res) => {
    const body = spawnEventSchema.parse(req.body);
    const result = await spawnAdminWorldEvent(req.player!.playerId, body);

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ success: true, event: result.event });
  }));

  router.post('/events/:id/cancel', asyncHandler(async (req, res) => {
    const event = await cancelAdminEvent(req.params.id, req.player?.playerId);
    if (!event) {
      res.status(404).json({ error: { message: 'Event not found', code: 'NOT_FOUND' } });
      return;
    }

    res.json({ success: true });
  }));

  router.get('/mobs', asyncHandler(async (_req, res) => {
    const mobs = await listAdminMobs();
    res.json({ mobs });
  }));

  router.post('/boss/spawn', asyncHandler(async (req, res) => {
    const body = spawnBossSchema.parse(req.body);
    const result = await spawnAdminBoss(req.player!.playerId, body);

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ success: true, event: result.event, encounter: result.encounter });
  }));
}
