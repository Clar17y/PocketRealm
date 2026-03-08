import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  getActiveExpedition,
  getExpeditionStatus,
  launchExpedition,
  signUpForExpedition,
  recoverFromKO,
  forceStartExpedition,
} from '../services/expeditionService';
import {
  getShopItems,
  getPlayerTokens,
  purchaseShopItem,
} from '../services/expeditionShopService';
import { asyncHandler } from '../utils/asyncHandler';
import { paginationSchema, buildPagination } from '../utils/routeHelpers';

export const expeditionRouter = Router();
expeditionRouter.use(authenticate);

// GET /active
expeditionRouter.get('/active', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true },
  });
  if (!membership) {
    res.json({ expedition: null });
    return;
  }

  const expedition = await getActiveExpedition(membership.guildId);
  res.json({ expedition });
}));

// GET /history
const historyQuerySchema = z.object({
  ...paginationSchema,
});

expeditionRouter.get('/history', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true },
  });
  if (!membership) {
    res.json({ expeditions: [], pagination: buildPagination(1, 10, 0) });
    return;
  }

  const { page, pageSize } = historyQuerySchema.parse(req.query);
  const where = {
    guildId: membership.guildId,
    status: { in: ['completed', 'failed'] as string[] },
  };

  const [expeditions, total] = await Promise.all([
    prisma.guildExpedition.findMany({
      where,
      orderBy: { completedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { members: true } } },
    }),
    prisma.guildExpedition.count({ where }),
  ]);

  // Resolve launcher usernames
  const launcherIds = [...new Set(expeditions.map(e => e.launchedBy))];
  const launchers = await prisma.player.findMany({
    where: { id: { in: launcherIds } },
    select: { id: true, username: true },
  });
  const usernameMap = new Map(launchers.map(p => [p.id, p.username]));

  res.json({
    expeditions: expeditions.map(e => ({
      id: e.id,
      tier: e.tier,
      status: e.status,
      totalRooms: e.totalRooms,
      currentRoom: e.currentRoom,
      startedAt: e.startedAt.toISOString(),
      completedAt: e.completedAt?.toISOString() ?? null,
      launchedBy: e.launchedBy,
      launchedByUsername: usernameMap.get(e.launchedBy) ?? null,
      participantCount: e._count.members,
    })),
    pagination: buildPagination(page, pageSize, total),
  });
}));

// GET /shop
expeditionRouter.get('/shop', asyncHandler(async (req, res) => {
  const items = getShopItems();
  const tokens = await getPlayerTokens(req.player!.playerId);
  res.json({ items, tokens });
}));

// POST /shop/purchase
const purchaseSchema = z.object({ itemId: z.string() });

expeditionRouter.post('/shop/purchase', asyncHandler(async (req, res) => {
  const { itemId } = purchaseSchema.parse(req.body);
  const result = await purchaseShopItem(req.player!.playerId, itemId);
  res.json(result);
}));

const expeditionIdSchema = z.object({ id: z.string().uuid() });

// GET /:id
expeditionRouter.get('/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = expeditionIdSchema.parse(req.params);
  const data = await getExpeditionStatus(id);
  if (!data) {
    throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  }

  // Verify the requesting player belongs to the same guild
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true },
  });
  if (!membership || membership.guildId !== data.expedition.guildId) {
    throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  }

  // Resolve launcher username
  const launcher = await prisma.player.findUnique({
    where: { id: data.expedition.launchedBy },
    select: { username: true },
  });

  res.json({
    expedition: {
      ...data.expedition,
      launchedByUsername: launcher?.username ?? null,
    },
    members: data.members,
  });
}));

// POST /launch
const launchSchema = z.object({
  tier: z.number().int().min(1).max(3),
});

expeditionRouter.post('/launch', asyncHandler(async (req, res) => {
  const body = launchSchema.parse(req.body);
  const expedition = await launchExpedition(req.player!.playerId, body.tier);
  res.status(201).json({ expedition });
}));

// POST /:id/signup
expeditionRouter.post('/:id/signup', asyncHandler(async (req, res) => {
  const { id } = expeditionIdSchema.parse(req.params);
  const member = await signUpForExpedition(id, req.player!.playerId);
  res.json({ member });
}));

// POST /:id/force-start
expeditionRouter.post('/:id/force-start', asyncHandler(async (req, res) => {
  const { id } = expeditionIdSchema.parse(req.params);
  const result = await forceStartExpedition(id, req.player!.playerId);
  res.json(result);
}));

// POST /:id/recover
expeditionRouter.post('/:id/recover', asyncHandler(async (req, res) => {
  const { id } = expeditionIdSchema.parse(req.params);
  const member = await recoverFromKO(id, req.player!.playerId);
  res.json({ member });
}));
