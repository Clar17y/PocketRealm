import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pocketrealm/database';
import { QUERY_LIMITS } from '@pocketrealm/shared';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getOwnedItem, assertInTown } from '../utils/routeHelpers.js';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { useConsumable } from '../services/consumableService';
import { getPlayerGuildModifiers } from '../services/guildUpgradeService';
import { repairAllEquipped, repairTurnCost, repairItemDurability } from '../services/repairService';
import { invalidateEquipmentCache } from '../services/equipmentService';
import { asyncHandler } from '../utils/asyncHandler';
import { sellItem, sellBulk } from '../services/sellService';
import { depositItem, depositBatch, withdrawItem, withdrawBatch, listStash } from '../services/stashService';
import { claimPendingLoot, getPendingLoot } from '../services/pendingLootService';
import { getInventoryState } from '../services/inventoryService';
import { fetchInventoryMeta, fetchItemDTOs, buildStateUpdates, fetchMaterialTotals } from '../services/stateUpdateHelpers';

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

/**
 * GET /api/v1/inventory
 * List all items owned by the player.
 */
inventoryRouter.get('/', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  const [items, equipped, inventoryState, materialRows] = await Promise.all([
    prisma.item.findMany({
      where: { ownerId: playerId, inStash: false },
      include: { template: true },
      orderBy: [{ createdAt: 'desc' }],
      take: QUERY_LIMITS.MAX_INVENTORY_RESULTS,
    }),
    prisma.playerEquipment.findMany({
      where: { playerId, itemId: { not: null } },
      select: { slot: true, itemId: true },
    }),
    getInventoryState(playerId),
    prisma.item.groupBy({
      by: ['templateId'],
      where: { ownerId: playerId },
      _sum: { quantity: true },
    }),
  ]);
  const { usedSlots, capacity } = inventoryState;

  const equippedByItemId = new Map<string, string>();
  for (const e of equipped) {
    if (e.itemId) equippedByItemId.set(e.itemId, e.slot);
  }

  const materialTotals: Record<string, number> = {};
  for (const row of materialRows) {
    materialTotals[row.templateId] = row._sum.quantity ?? 0;
  }

  res.json({
    items: items.map((item: typeof items[number]) => ({
      ...item,
      equippedSlot: equippedByItemId.get(item.id) ?? null,
    })),
    capacity,
    usedSlots,
    materialTotals,
  });
}));

const deleteParamsSchema = z.object({
  id: z.string().uuid(),
});

const deleteQuerySchema = z.object({
  quantity: z.coerce.number().int().positive().optional(),
});

/**
 * DELETE /api/v1/inventory/:id?quantity=2
 * Destroy an item or reduce a stack.
 */
inventoryRouter.delete('/:id', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const params = deleteParamsSchema.parse(req.params);
  const query = deleteQuerySchema.parse(req.query);

  const item = await getOwnedItem(playerId, params.id, {
    requireNotEquipped: true,
  });

  if (item.template.stackable && query.quantity && query.quantity < item.quantity) {
    const updated = await prisma.item.update({
      where: { id: item.id },
      data: { quantity: item.quantity - query.quantity },
    });
    const [inventoryMeta, updatedDTOs, materialTotals] = await Promise.all([
      fetchInventoryMeta(playerId),
      fetchItemDTOs([updated.id]),
      fetchMaterialTotals(playerId),
    ]);
    res.json({
      destroyed: false,
      itemId: updated.id,
      remainingQuantity: updated.quantity,
      stateUpdates: {
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        inventoryUpdated: updatedDTOs,
        materialTotals,
      },
    });
    return;
  }

  await prisma.item.delete({ where: { id: item.id } });
  const [inventoryMeta, materialTotals] = await Promise.all([
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  res.json({
    destroyed: true,
    itemId: item.id,
    stateUpdates: {
      inventoryRemoved: [item.id],
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));

const repairSchema = z.object({
  itemId: z.string().uuid(),
});

/**
 * POST /api/v1/inventory/repair
 * Spend turns to repair an item; max durability decays on each repair.
 */
inventoryRouter.post('/repair', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = repairSchema.parse(req.body);
  const guildMods = await getPlayerGuildModifiers(playerId);
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({
      where: { id: body.itemId },
      include: { template: true },
    });

    if (!item || item.ownerId !== playerId) {
      throw new AppError(404, 'Item not found', 'NOT_FOUND');
    }

    if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
      throw new AppError(400, 'Only weapons/armor can be repaired', 'INVALID_ITEM_TYPE');
    }

    const current = item.currentDurability ?? item.template.maxDurability;
    const max = item.maxDurability ?? item.template.maxDurability;

    if (current >= max) {
      return {
        repaired: false as const,
        itemId: item.id,
        currentDurability: current,
        maxDurability: max,
      };
    }

    const baseCost = repairTurnCost(item.template.tier, current <= 0);
    const turnCost = guildMods.repairCostReduction > 0
      ? Math.max(1, Math.round(baseCost * (1 - guildMods.repairCostReduction)))
      : baseCost;
    const turnSpend = await spendPlayerTurnsTx(tx, playerId, turnCost);
    const { newMax, decay, destroyed } = await repairItemDurability(tx, { ...item, ownerId: playerId });

    return {
      repaired: true as const,
      turns: turnSpend,
      turnCost,
      itemId: item.id,
      name: item.template.name,
      currentDurability: newMax,
      maxDurability: newMax,
      maxDurabilityDecay: decay,
      destroyed,
    };
  });

  // Invalidate after the transaction commits so a rollback never leaves stale cache.
  if (result.repaired) {
    await invalidateEquipmentCache(playerId);
  }

  if (!result.repaired) {
    res.json(result);
    return;
  }

  if (result.destroyed) {
    const [inventoryMeta, gold, materialTotals] = await Promise.all([
      fetchInventoryMeta(playerId),
      buildStateUpdates(playerId, ['gold']),
      fetchMaterialTotals(playerId),
    ]);
    res.json({
      ...result,
      stateUpdates: {
        inventoryRemoved: [result.itemId],
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        gold: gold.gold,
        materialTotals,
      },
    });
    return;
  }

  const [repairedDTOs, gold] = await Promise.all([
    fetchItemDTOs([result.itemId]),
    buildStateUpdates(playerId, ['gold']),
  ]);
  res.json({
    ...result,
    stateUpdates: {
      inventoryUpdated: repairedDTOs,
      gold: gold.gold,
    },
  });
}));

/**
 * POST /api/v1/inventory/repair-equipped
 * Batch-repair all equipped items that have durability below max.
 */
inventoryRouter.post('/repair-equipped', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const result = await prisma.$transaction(async (tx) => {
    return repairAllEquipped(tx, playerId);
  });

  // Invalidate after the transaction commits so a rollback never leaves stale cache.
  if (result.repaired) {
    await invalidateEquipmentCache(playerId);
  }

  if (!result.repaired) {
    res.json(result);
    return;
  }

  const survivingIds = result.items.filter((i) => !i.destroyed).map((i) => i.itemId);
  const destroyedIds = result.items.filter((i) => i.destroyed).map((i) => i.itemId);

  const [survivingDTOs, goldUpdates, materialTotals] = await Promise.all([
    fetchItemDTOs(survivingIds),
    buildStateUpdates(playerId, ['gold']),
    destroyedIds.length > 0 ? fetchMaterialTotals(playerId) : Promise.resolve(undefined),
  ]);

  res.json({
    ...result,
    stateUpdates: {
      inventoryUpdated: survivingDTOs,
      ...(destroyedIds.length > 0 ? { inventoryRemoved: destroyedIds } : {}),
      gold: goldUpdates.gold,
      ...(materialTotals !== undefined ? { materialTotals } : {}),
    },
  });
}));

const useSchema = z.object({
  itemId: z.string().uuid(),
});

/**
 * POST /api/v1/inventory/use
 * Use a consumable item (e.g. health potion).
 */
inventoryRouter.post('/use', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = useSchema.parse(req.body);
  const result = await useConsumable(playerId, body.itemId);

  const [stateFields, updatedDTOs, materialTotals] = await Promise.all([
    buildStateUpdates(playerId, ['hp', 'resources', 'buffs']),
    result.remainingQuantity !== null ? fetchItemDTOs([body.itemId]) : Promise.resolve([]),
    fetchMaterialTotals(playerId),
  ]);

  const stateUpdates: Record<string, unknown> = {
    hp: stateFields.hp,
    resources: stateFields.resources,
    buffs: stateFields.buffs,
    materialTotals,
  };

  if (result.remainingQuantity === null) {
    stateUpdates.inventoryRemoved = [body.itemId];
  } else {
    stateUpdates.inventoryUpdated = updatedDTOs;
  }

  res.json({ ...result, stateUpdates });
}));

// --- Sell endpoints ---

const sellSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().optional(),
});

inventoryRouter.post('/sell', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = sellSchema.parse(req.body);
  await assertInTown(playerId);
  const result = await sellItem(playerId, body.itemId, body.quantity);
  const [remainingDTOs, inventoryMeta, materialTotals] = await Promise.all([
    fetchItemDTOs([body.itemId]),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  const wasFullySold = remainingDTOs.length === 0;
  res.json({
    ...result,
    stateUpdates: {
      ...(wasFullySold
        ? { inventoryRemoved: [body.itemId] }
        : { inventoryUpdated: remainingDTOs }),
      gold: result.newGold,
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));

const sellBulkSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(50),
});

inventoryRouter.post('/sell/bulk', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = sellBulkSchema.parse(req.body);
  await assertInTown(playerId);
  const result = await sellBulk(playerId, body.itemIds);
  const [inventoryMeta, materialTotals] = await Promise.all([
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  res.json({
    ...result,
    stateUpdates: {
      inventoryRemoved: body.itemIds,
      gold: result.newGold,
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));

// --- Stash endpoints ---

inventoryRouter.get('/stash', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const items = await listStash(playerId);
  res.json({ items });
}));

const stashSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().optional(),
});

inventoryRouter.post('/stash/deposit', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = stashSchema.parse(req.body);
  await assertInTown(playerId);
  await depositItem(playerId, body.itemId, body.quantity);
  const [sourceItem, inventoryMeta, materialTotals] = await Promise.all([
    prisma.item.findUnique({
      where: { id: body.itemId },
      select: { inStash: true },
    }),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  const remainingDTOs = sourceItem?.inStash === false
    ? await fetchItemDTOs([body.itemId])
    : [];
  const inventoryDelta = remainingDTOs.length === 0
    ? { inventoryRemoved: [body.itemId] }
    : { inventoryUpdated: remainingDTOs };
  res.json({
    success: true,
    stateUpdates: {
      ...inventoryDelta,
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));

const stashBatchSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(50),
});

inventoryRouter.post('/stash/deposit/batch', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = stashBatchSchema.parse(req.body);
  await assertInTown(playerId);
  const result = await depositBatch(playerId, body.itemIds);
  const [inventoryMeta, materialTotals] = await Promise.all([
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  res.json({
    depositedCount: result.depositedCount,
    stateUpdates: {
      ...(result.depositedItemIds.length > 0 ? { inventoryRemoved: result.depositedItemIds } : {}),
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));

inventoryRouter.post('/stash/withdraw', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = stashSchema.parse(req.body);
  await assertInTown(playerId);

  const withdrawResult = await withdrawItem(playerId, body.itemId, body.quantity);

  const [itemDTOs, inventoryMeta, materialTotals] = await Promise.all([
    fetchItemDTOs([withdrawResult.itemId]),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  res.json({
    success: true,
    stateUpdates: {
      ...(withdrawResult.merged
        ? { inventoryUpdated: itemDTOs }
        : { inventoryAdded: itemDTOs }),
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));

inventoryRouter.post('/stash/withdraw/batch', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = stashBatchSchema.parse(req.body);
  await assertInTown(playerId);
  const result = await withdrawBatch(playerId, body.itemIds);
  const [addedDTOs, updatedDTOs, inventoryMeta, materialTotals] = await Promise.all([
    result.addedItemIds.length > 0 ? fetchItemDTOs(result.addedItemIds) : Promise.resolve([]),
    result.updatedItemIds.length > 0 ? fetchItemDTOs(result.updatedItemIds) : Promise.resolve([]),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  res.json({
    withdrawnCount: result.withdrawnCount,
    stateUpdates: {
      ...(addedDTOs.length > 0 ? { inventoryAdded: addedDTOs } : {}),
      ...(updatedDTOs.length > 0 ? { inventoryUpdated: updatedDTOs } : {}),
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));

// --- Loot endpoints ---

const lootSessionSchema = z.object({ sessionId: z.string().uuid() });

inventoryRouter.get('/loot/:sessionId', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const { sessionId } = lootSessionSchema.parse({ sessionId: req.params.sessionId });
  const items = await getPendingLoot(playerId, sessionId);
  if (!items) {
    res.json({ items: [] });
    return;
  }
  res.json({ items });
}));

const lootClaimSchema = z.object({
  sessionId: z.string().uuid(),
  selectedIndices: z.array(z.number().int().min(0)).min(0),
});

inventoryRouter.post('/loot/claim', asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;
  const body = lootClaimSchema.parse(req.body);
  const { claimedItemIds } = await claimPendingLoot(playerId, body.sessionId, body.selectedIndices);
  const [itemDTOs, inventoryMeta, materialTotals] = await Promise.all([
    fetchItemDTOs(claimedItemIds),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);
  res.json({
    success: true,
    stateUpdates: {
      inventoryAdded: itemDTOs,
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    },
  });
}));
