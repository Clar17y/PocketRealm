import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import {
  createGuild, getPlayerGuild, getGuild, searchGuilds,
  joinGuild, leaveGuild, kickMember, promoteMember,
  demoteMember, transferLeadership, disbandGuild,
  updateSettings, getGuildLog,
} from '../services/guildService';

export const guildRouter = Router();
guildRouter.use(authenticate);

const createSchema = z.object({
  name: z.string().min(3).max(32).trim(),
  tag: z.string().min(2).max(4).trim().toUpperCase(),
  description: z.string().max(200).trim().nullable().optional(),
});

const settingsSchema = z.object({
  recruitmentMode: z.enum(['open', 'invite_only', 'closed']).optional(),
  minLevelRequirement: z.number().int().min(0).max(100).optional(),
  taxRate: z.number().int().min(0).max(20).optional(),
  description: z.string().max(200).trim().nullable().optional(),
});

const searchSchema = z.object({
  query: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

const targetSchema = z.object({
  targetId: z.string().uuid(),
});

// POST / — create guild
guildRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid input', code: 'VALIDATION_ERROR' } });
      return;
    }
    const result = await createGuild(req.player!.playerId, parsed.data.name, parsed.data.tag, parsed.data.description ?? null);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// GET / — get player's guild
guildRouter.get('/', async (req, res, next) => {
  try {
    const result = await getPlayerGuild(req.player!.playerId);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /search — search guilds
guildRouter.get('/search', async (req, res, next) => {
  try {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid query', code: 'VALIDATION_ERROR' } });
      return;
    }
    const result = await searchGuilds(parsed.data.query, parsed.data.page);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /:id — get guild by ID
guildRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await getGuild(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// PATCH /:id — update settings
guildRouter.patch('/:id', async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid settings', code: 'VALIDATION_ERROR' } });
      return;
    }
    const result = await updateSettings(req.player!.playerId, req.params.id, parsed.data);
    res.json(result);
  } catch (err) { next(err); }
});

// DELETE /:id — disband guild
guildRouter.delete('/:id', async (req, res, next) => {
  try {
    await disbandGuild(req.player!.playerId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/join
guildRouter.post('/:id/join', async (req, res, next) => {
  try {
    const result = await joinGuild(req.player!.playerId, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /:id/leave
guildRouter.post('/:id/leave', async (req, res, next) => {
  try {
    await leaveGuild(req.player!.playerId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/kick
guildRouter.post('/:id/kick', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await kickMember(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/promote
guildRouter.post('/:id/promote', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await promoteMember(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/demote
guildRouter.post('/:id/demote', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await demoteMember(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /:id/transfer
guildRouter.post('/:id/transfer', async (req, res, next) => {
  try {
    const parsed = targetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid target', code: 'VALIDATION_ERROR' } });
      return;
    }
    await transferLeadership(req.player!.playerId, parsed.data.targetId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /:id/log
guildRouter.get('/:id/log', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const result = await getGuildLog(req.params.id, page);
    res.json(result);
  } catch (err) { next(err); }
});
