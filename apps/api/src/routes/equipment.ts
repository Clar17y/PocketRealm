import { Router } from 'express';
import { z } from 'zod';
import type { EquipmentSlot } from '@adventure/shared';
import { authenticate } from '../middleware/auth';
import { equipItem, ensureEquipmentSlots, unequipSlot } from '../services/equipmentService';
import { assertNotRecovering } from '../utils/routeHelpers.js';
import { asyncHandler } from '../utils/asyncHandler';

export const equipmentRouter = Router();

equipmentRouter.use(authenticate);

const slotSchema = z.enum([
  'head',
  'neck',
  'chest',
  'gloves',
  'belt',
  'legs',
  'boots',
  'main_hand',
  'off_hand',
  'ring',
  'charm',
]);

const equipSchema = z.object({
  itemId: z.string().uuid(),
  slot: slotSchema,
});

/**
 * POST /api/v1/equipment/equip
 */
equipmentRouter.post('/equip', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = equipSchema.parse(req.body);

  // Check if player is recovering (prevents HP gear exploit)
  await assertNotRecovering(playerId);

  await equipItem(playerId, body.itemId, body.slot as EquipmentSlot);
  res.json({ success: true });
}));

const unequipSchema = z.object({
  slot: slotSchema,
});

/**
 * POST /api/v1/equipment/unequip
 */
equipmentRouter.post('/unequip', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = unequipSchema.parse(req.body);

  // Check if player is recovering (prevents HP gear exploit)
  await assertNotRecovering(playerId);

  await unequipSlot(playerId, body.slot as EquipmentSlot);
  res.json({ success: true });
}));

/**
 * POST /api/v1/equipment/init
 * Creates rows for all equipment slots (dev helper).
 */
equipmentRouter.post('/init', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  await ensureEquipmentSlots(playerId);
  res.json({ success: true });
}));
