import { Router } from 'express';
import { prisma } from '@pocketrealm/database';
import { CACHE_HEADER_CONSTANTS } from '@pocketrealm/shared';
import { getPublicSeasonArchives } from '../services/seasonPublicService';
import { asyncHandler } from '../utils/asyncHandler';

export const seasonsRouter = Router();

seasonsRouter.get('/active', asyncHandler(async (_req, res) => {
  const season = await prisma.season.findFirst({
    where: { status: 'active' },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      constantOverrides: true,
      features: true,
    },
    orderBy: { startsAt: 'desc' },
  });

  res.json({ season });
}));

seasonsRouter.get('/archives', asyncHandler(async (_req, res) => {
  const archives = await getPublicSeasonArchives();
  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
  res.json({ archives });
}));

seasonsRouter.get('/:id/hall-of-fame', asyncHandler(async (req, res) => {
  const entries = await prisma.hallOfFameEntry.findMany({
    where: { seasonId: req.params.id },
    select: {
      category: true,
      rank: true,
      accountId: true,
      username: true,
      value: true,
      createdAt: true,
    },
    orderBy: [
      { category: 'asc' },
      { rank: 'asc' },
    ],
  });

  res.set('Cache-Control', CACHE_HEADER_CONSTANTS.PUBLIC_LONG);
  res.json({ entries });
}));
