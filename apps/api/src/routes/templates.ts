import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import {
  createTemplate,
  getTemplates,
  getActiveTemplate,
  setActiveTemplate,
  updateTemplate,
  deleteTemplate,
} from '../services/combatTemplateService';
import { getUnlockedActions } from '../services/skillPointService';
import { asyncHandler } from '../utils/asyncHandler';

export const templatesRouter = Router();

templatesRouter.use(authenticate);

const actionSchema = z.object({
  actionId: z.string().min(1),
  label: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(64),
  actions: z.array(actionSchema).min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  actions: z.array(actionSchema).min(1).optional(),
});

/** GET /api/v1/templates — List all player templates */
templatesRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const templates = await getTemplates(playerId);
  res.json({ templates });
}));

/** POST /api/v1/templates — Create a new template */
templatesRouter.post('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = createSchema.parse(req.body);
  const unlockedActions = await getUnlockedActions(playerId);
  const template = await createTemplate(playerId, body.name, body.actions, unlockedActions);
  res.status(201).json(template);
}));

/** GET /api/v1/templates/active — Get active template */
templatesRouter.get('/active', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const actions = await getActiveTemplate(playerId);
  res.json({ actions });
}));

/** PATCH /api/v1/templates/:id — Update a template */
templatesRouter.patch('/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = req.params;
  const body = updateSchema.parse(req.body);
  const unlockedActions = await getUnlockedActions(playerId);
  const template = await updateTemplate(playerId, id, body.name, body.actions, unlockedActions);
  res.json(template);
}));

/** DELETE /api/v1/templates/:id — Delete a template */
templatesRouter.delete('/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = req.params;
  await deleteTemplate(playerId, id);
  res.json({ success: true });
}));

/** POST /api/v1/templates/:id/activate — Set as active template */
templatesRouter.post('/:id/activate', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = req.params;
  await setActiveTemplate(playerId, id);
  res.json({ success: true });
}));
