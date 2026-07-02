import { Router } from 'express';
import { z } from 'zod';
import type { EquipmentSlot } from '@pocketrealm/shared';
import { authenticate } from '../middleware/auth';
import { equipItem, unequipSlot, getEquippedItemInSlot, ensureEquipmentSlots } from '../services/equipmentService';
import { assertNotRecovering } from '../utils/routeHelpers.js';
import { asyncHandler } from '../utils/asyncHandler';
import { toInventoryItemDTO, fetchInventoryMeta, fetchEquipmentMap } from '../services/stateUpdateHelpers';

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
  'backpack',
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

  // Capture any item currently in the target slot before equipping (swap detection)
  const previousItem = await getEquippedItemInSlot(playerId, body.slot as EquipmentSlot);

  await equipItem(playerId, body.itemId, body.slot as EquipmentSlot);

  const [equipment, { inventoryCapacity, inventoryUsedSlots }] = await Promise.all([
    fetchEquipmentMap(playerId),
    fetchInventoryMeta(playerId),
  ]);

  const updatedItems = [];

  // Newly equipped item stays in inventory with equippedSlot set — get the DTO from the map
  const equippedItemDTO = equipment[body.slot] ?? null;
  if (equippedItemDTO) {
    updatedItems.push(equippedItemDTO);
  }

  // If a different item was displaced, it returns to inventory with equippedSlot: null
  if (previousItem && previousItem.id !== body.itemId) {
    updatedItems.push(toInventoryItemDTO(
      { ...previousItem, bonusStats: previousItem.bonusStats as Record<string, number> | null },
      null,
    ));
  }

  const stateUpdates = {
    equipment,
    inventoryUpdated: updatedItems,
    inventoryCapacity,
    inventoryUsedSlots,
  };

  res.json({ success: true, stateUpdates });
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

  // Capture the item being unequipped before clearing the slot
  const unequippedItem = await getEquippedItemInSlot(playerId, body.slot as EquipmentSlot);

  await unequipSlot(playerId, body.slot as EquipmentSlot);

  const [equipment, { inventoryCapacity, inventoryUsedSlots }] = await Promise.all([
    fetchEquipmentMap(playerId),
    fetchInventoryMeta(playerId),
  ]);

  res.json({
    success: true,
    stateUpdates: {
      equipment,
      inventoryUpdated: unequippedItem
        ? [
            toInventoryItemDTO(
              { ...unequippedItem, bonusStats: unequippedItem.bonusStats as Record<string, number> | null },
              null,
            ),
          ]
        : [],
      inventoryCapacity,
      inventoryUsedSlots,
    },
  });
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
