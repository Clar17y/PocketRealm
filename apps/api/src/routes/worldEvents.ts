import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  expireStaleEvents,
  getAllActiveEvents,
  getActiveEventsForZone,
  getEventById,
} from '../services/worldEventService';
import { checkAndSpawnEvents } from '../services/eventSchedulerService';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../logger';
import { getIo } from '../socket';

export const worldEventsRouter = Router();

worldEventsRouter.use(authenticate);

/**
 * GET /api/v1/events
 * List all active world events after activity-triggered catch-up.
 */
worldEventsRouter.get('/', asyncHandler(async (_req, res) => {
  await checkAndSpawnEvents(getIo()).catch((err) => {
    logger.warn({ err }, 'World events list catch-up failed');
  });
  await expireStaleEvents();
  const events = await getAllActiveEvents();
  res.json({ events });
}));

const zoneIdSchema = z.object({ zoneId: z.string().uuid() });

/**
 * GET /api/v1/events/zone/:zoneId
 * Active events for a specific zone (must be registered before /:id).
 */
worldEventsRouter.get('/zone/:zoneId', asyncHandler(async (req, res) => {
  const { zoneId } = zoneIdSchema.parse(req.params);
  const events = await getActiveEventsForZone(zoneId);
  res.json({ events });
}));

const eventIdSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/v1/events/:id
 * Single event detail.
 */
worldEventsRouter.get('/:id', asyncHandler(async (req, res) => {
  const { id } = eventIdSchema.parse(req.params);
  const event = await getEventById(id);
  if (!event) {
    throw new AppError(404, 'Event not found', 'NOT_FOUND');
  }
  res.json({ event });
}));
