import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import {
  createGuild, getPlayerGuild, getGuild, searchGuilds,
  joinGuild, leaveGuild, kickMember, promoteMember,
  demoteMember, transferLeadership, disbandGuild,
  updateSettings, getGuildLog,
  requestJoinGuild, getJoinRequests, respondToJoinRequest,
} from '../services/guildService';
import { activateUpgrade, getActiveUpgrades, getAvailableUpgrades } from '../services/guildUpgradeService';
import { getActiveContracts } from '../services/guildContractService';
import {
  startProject, getGuildProjects, getAvailableProjects,
  contributeTurns, contributeMaterials,
} from '../services/guildProjectService';
import {
  selectSpecialization, respecSpecialization, getSpecializationStatus,
} from '../services/guildSpecializationService';
import { asyncHandler } from '../utils/asyncHandler';

export const guildRouter = Router();
guildRouter.use(authenticate);

const createSchema = z.object({
  name: z.string().min(3).max(32).trim(),
  tag: z.string().min(2).max(4).trim().toUpperCase(),
  description: z.string().max(200).trim().nullable().optional(),
});

const settingsSchema = z.object({
  recruitmentMode: z.enum(['open', 'request_to_join', 'closed']).optional(),
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

const logQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
});

const activateUpgradeSchema = z.object({
  upgradeKey: z.string().min(1),
  tier: z.number().int().positive(),
});

// POST / — create guild
guildRouter.post('/', asyncHandler(async (req, res) => {
  const body = createSchema.parse(req.body);
  const result = await createGuild(req.player!.playerId, body.name, body.tag, body.description ?? null);
  res.status(201).json(result);
}));

// GET / — get player's guild
guildRouter.get('/', asyncHandler(async (req, res) => {
  const result = await getPlayerGuild(req.player!.playerId);
  res.json(result);
}));

// GET /search — search guilds
guildRouter.get('/search', asyncHandler(async (req, res) => {
  const query = searchSchema.parse(req.query);
  const result = await searchGuilds(query.query, query.page);
  res.json(result);
}));

// GET /:id — get guild by ID
guildRouter.get('/:id', asyncHandler(async (req, res) => {
  const result = await getGuild(req.params.id);
  res.json(result);
}));

// PATCH /:id — update settings
guildRouter.patch('/:id', asyncHandler(async (req, res) => {
  const body = settingsSchema.parse(req.body);
  const result = await updateSettings(req.player!.playerId, req.params.id, body);
  res.json(result);
}));

// DELETE /:id — disband guild
guildRouter.delete('/:id', asyncHandler(async (req, res) => {
  await disbandGuild(req.player!.playerId, req.params.id);
  res.json({ success: true });
}));

// POST /:id/join
guildRouter.post('/:id/join', asyncHandler(async (req, res) => {
  const result = await joinGuild(req.player!.playerId, req.params.id);
  res.json(result);
}));

// POST /:id/leave
guildRouter.post('/:id/leave', asyncHandler(async (req, res) => {
  await leaveGuild(req.player!.playerId);
  res.json({ success: true });
}));

// POST /:id/request — submit a join request (request_to_join guilds)
guildRouter.post('/:id/request', asyncHandler(async (req, res) => {
  await requestJoinGuild(req.player!.playerId, req.params.id);
  res.json({ success: true });
}));

// GET /:id/requests — list pending join requests (officers/leaders only)
guildRouter.get('/:id/requests', asyncHandler(async (req, res) => {
  const requests = await getJoinRequests(req.player!.playerId, req.params.id);
  res.json({ requests });
}));

// POST /:id/requests/:requestId/accept
guildRouter.post('/:id/requests/:requestId/accept', asyncHandler(async (req, res) => {
  await respondToJoinRequest(req.player!.playerId, req.params.requestId, true);
  res.json({ success: true });
}));

// POST /:id/requests/:requestId/reject
guildRouter.post('/:id/requests/:requestId/reject', asyncHandler(async (req, res) => {
  await respondToJoinRequest(req.player!.playerId, req.params.requestId, false);
  res.json({ success: true });
}));

// POST /:id/kick
guildRouter.post('/:id/kick', asyncHandler(async (req, res) => {
  const body = targetSchema.parse(req.body);
  await kickMember(req.player!.playerId, body.targetId);
  res.json({ success: true });
}));

// POST /:id/promote
guildRouter.post('/:id/promote', asyncHandler(async (req, res) => {
  const body = targetSchema.parse(req.body);
  await promoteMember(req.player!.playerId, body.targetId);
  res.json({ success: true });
}));

// POST /:id/demote
guildRouter.post('/:id/demote', asyncHandler(async (req, res) => {
  const body = targetSchema.parse(req.body);
  await demoteMember(req.player!.playerId, body.targetId);
  res.json({ success: true });
}));

// POST /:id/transfer
guildRouter.post('/:id/transfer', asyncHandler(async (req, res) => {
  const body = targetSchema.parse(req.body);
  await transferLeadership(req.player!.playerId, body.targetId);
  res.json({ success: true });
}));

// GET /:id/log
guildRouter.get('/:id/log', asyncHandler(async (req, res) => {
  const { page } = logQuerySchema.parse(req.query);
  const result = await getGuildLog(req.params.id, page);
  res.json(result);
}));

// --- Upgrades ---

// GET /:id/upgrades
guildRouter.get('/:id/upgrades', asyncHandler(async (req, res) => {
  const [active, available] = await Promise.all([
    getActiveUpgrades(req.params.id),
    getAvailableUpgrades(req.params.id),
  ]);
  res.json({ active, available });
}));

// POST /:id/upgrades/activate
guildRouter.post('/:id/upgrades/activate', asyncHandler(async (req, res) => {
  const body = activateUpgradeSchema.parse(req.body);
  const result = await activateUpgrade(req.player!.playerId, req.params.id, body.upgradeKey, body.tier);
  res.json(result);
}));

// --- Contracts ---

// GET /:id/contracts
guildRouter.get('/:id/contracts', asyncHandler(async (req, res) => {
  const contracts = await getActiveContracts(req.params.id);
  res.json({ contracts });
}));

// --- Projects ---

const startProjectSchema = z.object({
  projectKey: z.string().min(1),
});

const contributeTurnsSchema = z.object({
  amount: z.number().int().positive(),
});

const contributeMaterialsSchema = z.object({
  templateId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

// GET /:id/projects
guildRouter.get('/:id/projects', asyncHandler(async (req, res) => {
  const projects = await getGuildProjects(req.params.id);
  const available = await getAvailableProjects(req.params.id);
  res.json({ projects, available });
}));

// POST /:id/projects/start
guildRouter.post('/:id/projects/start', asyncHandler(async (req, res) => {
  const body = startProjectSchema.parse(req.body);
  const result = await startProject(req.player!.playerId, req.params.id, body.projectKey);
  res.status(201).json(result);
}));

// POST /:id/projects/:projectId/contribute/turns
guildRouter.post('/:id/projects/:projectId/contribute/turns', asyncHandler(async (req, res) => {
  const body = contributeTurnsSchema.parse(req.body);
  const result = await contributeTurns(
    req.player!.playerId, req.params.id, req.params.projectId, body.amount,
  );
  res.json(result);
}));

// POST /:id/projects/:projectId/contribute/materials
guildRouter.post('/:id/projects/:projectId/contribute/materials', asyncHandler(async (req, res) => {
  const body = contributeMaterialsSchema.parse(req.body);
  const result = await contributeMaterials(
    req.player!.playerId, req.params.id, req.params.projectId, body.templateId, body.quantity,
  );
  res.json(result);
}));

// --- Specialization ---

const selectSpecializationSchema = z.object({
  path: z.enum(['warfare', 'industry', 'discovery']),
});

// GET /:id/specialization
guildRouter.get('/:id/specialization', asyncHandler(async (req, res) => {
  const result = await getSpecializationStatus(req.params.id);
  res.json(result);
}));

// POST /:id/specialization/select
guildRouter.post('/:id/specialization/select', asyncHandler(async (req, res) => {
  const body = selectSpecializationSchema.parse(req.body);
  const result = await selectSpecialization(req.player!.playerId, req.params.id, body.path);
  res.json(result);
}));

// POST /:id/specialization/respec
guildRouter.post('/:id/specialization/respec', asyncHandler(async (req, res) => {
  const body = selectSpecializationSchema.parse(req.body);
  const result = await respecSpecialization(req.player!.playerId, req.params.id, body.path);
  res.json(result);
}));
