import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  getActiveExpedition,
  getExpeditionStatus,
  getExpeditionCooldowns,
  launchExpedition,
  signUpForExpedition,
  recoverFromKO,
  forceStartExpedition,
  checkAndResolveExpeditionRounds,
  resolveExpeditionRound,
  autoResolveRoom,
  setTargetMob,
  setHealTarget,
  abandonExpedition,
} from '../services/expeditionService';
import {
  getShopItems,
  getPlayerTokens,
  purchaseShopItem,
} from '../services/expeditionShopService';
import { asyncHandler } from '../utils/asyncHandler';
import { paginationSchema, buildPagination } from '../utils/routeHelpers';
import { EXPEDITION_THEMES } from '@pocketrealm/shared';

export const expeditionRouter = Router();
expeditionRouter.use(authenticate);

// GET /cooldowns
expeditionRouter.get('/cooldowns', asyncHandler(async (req, res) => {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId: req.player!.playerId },
    select: { guildId: true },
  });
  if (!membership) {
    res.json({ weeklyCooldowns: {}, betweenCooldown: null, hasActiveExpedition: false });
    return;
  }
  const cooldowns = await getExpeditionCooldowns(membership.guildId);
  res.json(cooldowns);
}));

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

  // Resolve any due rounds before returning data (same pattern as boss routes)
  await checkAndResolveExpeditionRounds(null);

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

  // Resolve theme names
  const themeMap = new Map(EXPEDITION_THEMES.map(t => [t.id, t.name]));

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
      wipeCount: e.wipeCount ?? 0,
      themeId: e.themeId,
      themeName: e.themeId ? themeMap.get(e.themeId) ?? null : null,
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

  // Resolve any due rounds before returning data
  await checkAndResolveExpeditionRounds(null);

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

// POST /:id/force-round
expeditionRouter.post('/:id/force-round', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = expeditionIdSchema.parse(req.params);

  const expedition = await prisma.guildExpedition.findUnique({
    where: { id },
    select: { id: true, guildId: true, status: true, nextRoundAt: true },
  });
  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  if (expedition.status !== 'in_progress') {
    throw new AppError(400, 'Expedition is not active', 'NOT_ACTIVE');
  }
  // Enforce round timing to prevent rapid-fire resolution
  if (expedition.nextRoundAt && expedition.nextRoundAt > new Date()) {
    throw new AppError(400, 'Round is not ready yet', 'ROUND_NOT_READY');
  }

  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true, role: true },
  });
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role === 'member') {
    throw new AppError(403, 'Officer or leader role required', 'INSUFFICIENT_ROLE');
  }

  // Resolve this expedition's round directly (not the global scheduler)
  await resolveExpeditionRound(id, null);

  // Fetch updated state
  const updated = await prisma.guildExpedition.findUnique({
    where: { id },
    select: { status: true, currentRoom: true, roundNumber: true },
  });

  res.json({
    success: true,
    status: updated?.status,
    currentRoom: updated?.currentRoom,
    roundNumber: updated?.roundNumber,
  });
}));

// POST /:id/auto-resolve (same auth pattern as force-round)
expeditionRouter.post('/:id/auto-resolve', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = expeditionIdSchema.parse(req.params);

  // Verify guild membership + officer/leader role
  const expedition = await prisma.guildExpedition.findUnique({
    where: { id },
    select: { guildId: true, nextRoundAt: true },
  });
  if (!expedition) throw new AppError(404, 'Expedition not found', 'NOT_FOUND');
  // Enforce round timing to prevent instant room clears
  if (expedition.nextRoundAt && expedition.nextRoundAt > new Date()) {
    throw new AppError(400, 'Round is not ready yet', 'ROUND_NOT_READY');
  }

  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true, role: true },
  });
  if (!membership || membership.guildId !== expedition.guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role === 'member') {
    throw new AppError(403, 'Officer or leader role required', 'INSUFFICIENT_ROLE');
  }

  // Service validates status + roundNumber and does full fetch
  const result = await autoResolveRoom(id);

  res.json({
    success: true,
    outcome: result.outcome,
    roundsResolved: result.roundsResolved,
    tokensAwarded: result.tokensAwarded,
    roundLogs: result.roundLogs,
  });
}));

// POST /:id/abandon
expeditionRouter.post('/:id/abandon', asyncHandler(async (req, res) => {
  const { id } = expeditionIdSchema.parse(req.params);
  await abandonExpedition(id, req.player!.playerId);
  res.json({ data: { success: true } });
}));

// PATCH /:id/target
const targetSchema = z.object({ targetMobId: z.string().nullable() });

expeditionRouter.patch('/:id/target', asyncHandler(async (req, res) => {
  const { id } = expeditionIdSchema.parse(req.params);
  const { targetMobId } = targetSchema.parse(req.body);
  await setTargetMob(id, req.player!.playerId, targetMobId);
  res.json({ success: true });
}));

// PATCH /:id/heal-target
const healTargetSchema = z.object({ healTargetPlayerId: z.string().uuid().nullable() });

expeditionRouter.patch('/:id/heal-target', asyncHandler(async (req, res) => {
  const { id } = expeditionIdSchema.parse(req.params);
  const { healTargetPlayerId } = healTargetSchema.parse(req.body);
  await setHealTarget(id, req.player!.playerId, healTargetPlayerId ?? null);
  res.json({ data: { success: true } });
}));

// POST /:id/recover
expeditionRouter.post('/:id/recover', asyncHandler(async (req, res) => {
  const { id } = expeditionIdSchema.parse(req.params);
  const member = await recoverFromKO(id, req.player!.playerId);
  res.json({ member });
}));
