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

const conditionSchema = z.object({
  type: z.enum(['resource_below', 'resource_above', 'has_buff', 'has_debuff', 'no_buff', 'no_debuff', 'any_debuff', 'any_magic_dot']),
  resource: z.enum(['hp', 'stamina', 'mana']).optional(),
  threshold: z.number().int().min(0).max(100).optional(),
  effectName: z.string().min(1).optional(),
}).refine(data => {
  if (data.type === 'resource_below' || data.type === 'resource_above') {
    return data.resource !== undefined && data.threshold !== undefined;
  }
  return true;
}, { message: 'resource and threshold are required for resource conditions' }).refine(data => {
  if (['has_buff', 'has_debuff', 'no_buff', 'no_debuff'].includes(data.type)) {
    return data.effectName !== undefined;
  }
  return true;
}, { message: 'effectName is required for buff/debuff conditions' });

const slotSchema = z.object({
  sortOrder: z.number().int().min(0),
  actionId: z.string().min(1),
  condition: conditionSchema.optional(),
  thenActionId: z.string().min(1).optional(),
}).refine(data => {
  if (data.condition && !data.thenActionId) return false;
  if (!data.condition && data.thenActionId) return false;
  return true;
}, { message: 'condition and thenActionId must both be present or both absent' });

const createSchema = z.object({
  name: z.string().min(1).max(64),
  slots: z.array(slotSchema).min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  slots: z.array(slotSchema).min(1).optional(),
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
  const template = await createTemplate(playerId, body.name, body.slots, unlockedActions);
  res.status(201).json(template);
}));

/** GET /api/v1/templates/active — Get active template */
templatesRouter.get('/active', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const slots = await getActiveTemplate(playerId);
  res.json({ slots });
}));

/** PATCH /api/v1/templates/:id — Update a template */
templatesRouter.patch('/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { id } = req.params;
  const body = updateSchema.parse(req.body);
  const unlockedActions = await getUnlockedActions(playerId);
  const template = await updateTemplate(playerId, id, body.name, body.slots, unlockedActions);
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
