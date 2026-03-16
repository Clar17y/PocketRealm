import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import type { EquipmentSlot, InventoryItemDTO } from '@pocketrealm/shared';
import { authenticate } from '../middleware/auth';
import { equipItem, ensureEquipmentSlots, unequipSlot } from '../services/equipmentService';
import { assertNotRecovering } from '../utils/routeHelpers.js';
import { asyncHandler } from '../utils/asyncHandler';
import { toInventoryItemDTO, fetchInventoryMeta } from '../services/stateUpdateHelpers';

export const equipmentRouter = Router();

/**
 * Fetch the full equipment map for a player.
 * Returns a Record mapping each slot to an InventoryItemDTO or null.
 */
async function fetchEquipmentMap(playerId: string): Promise<Record<string, InventoryItemDTO | null>> {
  const rows = await prisma.playerEquipment.findMany({
    where: { playerId },
    include: { item: { include: { template: true } } },
  });
  const map: Record<string, InventoryItemDTO | null> = {};
  for (const row of rows) {
    map[row.slot] = row.item
      ? toInventoryItemDTO(
          { ...row.item, bonusStats: row.item.bonusStats as Record<string, number> | null },
          row.slot,
        )
      : null;
  }
  return map;
}

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
  await ensureEquipmentSlots(playerId);
  const currentSlotRow = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot: body.slot } },
    include: { item: { include: { template: true } } },
  });
  const previousItem = currentSlotRow?.item ?? null;

  await equipItem(playerId, body.itemId, body.slot as EquipmentSlot);

  const [equipment, { inventoryUsedSlots }] = await Promise.all([
    fetchEquipmentMap(playerId),
    fetchInventoryMeta(playerId),
  ]);

  const stateUpdates: Record<string, unknown> = {
    equipment,
    inventoryRemoved: [body.itemId],
    inventoryUsedSlots,
  };

  // If a different item was in the slot before, it returns to inventory
  if (previousItem && previousItem.id !== body.itemId) {
    stateUpdates.inventoryAdded = [
      toInventoryItemDTO(
        { ...previousItem, bonusStats: previousItem.bonusStats as Record<string, number> | null },
        null,
      ),
    ];
  }

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
  await ensureEquipmentSlots(playerId);
  const currentSlotRow = await prisma.playerEquipment.findUnique({
    where: { playerId_slot: { playerId, slot: body.slot } },
    include: { item: { include: { template: true } } },
  });
  const unequippedItem = currentSlotRow?.item ?? null;

  await unequipSlot(playerId, body.slot as EquipmentSlot);

  const [equipment, { inventoryUsedSlots }] = await Promise.all([
    fetchEquipmentMap(playerId),
    fetchInventoryMeta(playerId),
  ]);

  res.json({
    success: true,
    stateUpdates: {
      equipment,
      inventoryAdded: unequippedItem
        ? [
            toInventoryItemDTO(
              { ...unequippedItem, bonusStats: unequippedItem.bonusStats as Record<string, number> | null },
              null,
            ),
          ]
        : [],
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
