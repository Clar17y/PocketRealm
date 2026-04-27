import { Router } from 'express';
import { CACHE_HEADER_CONSTANTS } from '@pocketrealm/shared';
import {
  getPublicActiveSeason,
  getPublicHallOfFameEntries,
  getPublicSeasonArchives,
} from '../services/seasonPublicService';
import { asyncHandler } from '../utils/asyncHandler';

export const seasonsRouter = Router();

seasonsRouter.get('/active', asyncHandler(async (_req, res) => {
  const season = await getPublicActiveSeason();
  res.json({ season });
}));

seasonsRouter.get('/archives', asyncHandler(async (_req, res) => {
  const archives = await getPublicSeasonArchives();
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
  res.json({ archives });
}));

seasonsRouter.get('/:id/hall-of-fame', asyncHandler(async (req, res) => {
  const entries = await getPublicHallOfFameEntries(req.params.id);
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
  res.json({ entries });
}));
