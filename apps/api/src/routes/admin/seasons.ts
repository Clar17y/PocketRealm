import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  activateAdminSeason,
  bootstrapAdminSeason,
  createAdminSeason,
  endAdminSeason,
  evaluateAdminSeasonRewards,
  listAdminSeasons,
  mergeAdminSeason,
} from '../../services/admin/seasonAdminService';

const createSeasonSchema = z.object({
  name: z.string().min(1).max(64),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  constantOverrides: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  features: z.array(z.string()).optional(),
});

export function registerSeasonAdminRoutes(router: Router): void {
  router.get('/seasons', asyncHandler(async (_req, res) => {
    const seasons = await listAdminSeasons();
    res.json({ seasons });
  }));

  router.post('/seasons', asyncHandler(async (req, res) => {
    const data = createSeasonSchema.parse(req.body);
    const season = await createAdminSeason(req.player!.playerId, data);
    res.status(201).json({ season });
  }));

  router.post('/seasons/:id/bootstrap', asyncHandler(async (req, res) => {
    const result = await bootstrapAdminSeason(req.player!.playerId, req.params.id);
    res.json({ message: 'Season bootstrapped', ...result });
  }));

  router.post('/seasons/:id/activate', asyncHandler(async (req, res) => {
    const season = await activateAdminSeason(req.player!.playerId, req.params.id);
    res.json({ season });
  }));

  router.post('/seasons/:id/end', asyncHandler(async (req, res) => {
    await endAdminSeason(req.player!.playerId, req.params.id);
    res.json({ message: 'Season ended. Run merge when ready.' });
  }));

  router.post('/seasons/:id/evaluate-rewards', asyncHandler(async (req, res) => {
    const result = await evaluateAdminSeasonRewards(req.player!.playerId, req.params.id);
    res.json({ message: 'Rewards evaluated', hallOfFameEntries: result.entries });
  }));

  router.post('/seasons/:id/merge', asyncHandler(async (req, res) => {
    const result = await mergeAdminSeason(req.player!.playerId, req.params.id);
    res.json({ message: 'Merge complete', merged: result.merged, errors: result.errors });
  }));
}
