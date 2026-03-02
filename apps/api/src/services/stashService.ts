import { prisma, Prisma } from '@adventure/database';
import { AppError } from '../middleware/errorHandler';
import { getInventoryState } from './inventoryService';

// Shared logic for moving stackable items between backpack (inStash=false) and stash (inStash=true)
async function moveStackableItem(
  tx: Prisma.TransactionClient,
  item: { id: string; ownerId: string; templateId: string; rarity: string; quantity: number; template: { stackable: boolean } },
  moveQty: number,
  targetInStash: boolean
): Promise<void> {
  if (!item.template.stackable) {
    await tx.item.update({ where: { id: item.id }, data: { inStash: targetInStash } });
    return;
  }

  // Full stack move for stackable items: merge into existing target stack if one exists
  if (moveQty >= item.quantity) {
    const existingTarget = await tx.item.findFirst({
      where: { ownerId: item.ownerId, templateId: item.templateId, inStash: targetInStash },
    });
    if (existingTarget) {
      await tx.item.update({
        where: { id: existingTarget.id },
        data: { quantity: existingTarget.quantity + item.quantity },
      });
      await tx.item.delete({ where: { id: item.id } });
    } else {
      await tx.item.update({ where: { id: item.id }, data: { inStash: targetInStash } });
    }
    return;
  }

  // Partial stack split: reduce source, merge into or create target
  await tx.item.update({
    where: { id: item.id },
    data: { quantity: item.quantity - moveQty },
  });

  const existingTarget = await tx.item.findFirst({
    where: { ownerId: item.ownerId, templateId: item.templateId, inStash: targetInStash },
  });

  if (existingTarget) {
    await tx.item.update({
      where: { id: existingTarget.id },
      data: { quantity: existingTarget.quantity + moveQty },
    });
  } else {
    await tx.item.create({
      data: {
        ownerId: item.ownerId,
        templateId: item.templateId,
        rarity: item.rarity,
        quantity: moveQty,
        maxDurability: null,
        currentDurability: null,
        inStash: targetInStash,
      } as any,
    });
  }
}

export async function depositItem(
  playerId: string,
  itemId: string,
  quantity?: number
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({
      where: { id: itemId },
      include: { template: true, equipment: true },
    });
    if (!item || item.ownerId !== playerId) throw new AppError(404, 'Item not found', 'NOT_FOUND');
    if (item.equipment.length > 0) throw new AppError(400, 'Cannot stash equipped items', 'ITEM_EQUIPPED');
    if (item.inStash) throw new AppError(400, 'Item is already in stash', 'ALREADY_STASHED');

    const depositQty = quantity ?? item.quantity;
    if (depositQty <= 0 || depositQty > item.quantity) {
      throw new AppError(400, 'Invalid quantity', 'INVALID_QUANTITY');
    }

    await moveStackableItem(tx, item, depositQty, true);
  }) as unknown as void;
}

export async function withdrawItem(
  playerId: string,
  itemId: string,
  quantity?: number
): Promise<void> {
  // Capacity check before transaction (low-concurrency single-player context)
  const { usedSlots, capacity } = await getInventoryState(playerId);

  if (usedSlots >= capacity) {
    throw new AppError(400, 'Backpack is full', 'BACKPACK_FULL');
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({
      where: { id: itemId },
      include: { template: true },
    });
    if (!item || item.ownerId !== playerId) throw new AppError(404, 'Item not found', 'NOT_FOUND');
    if (!item.inStash) throw new AppError(400, 'Item is not in stash', 'NOT_IN_STASH');

    const withdrawQty = quantity ?? item.quantity;
    if (withdrawQty <= 0 || withdrawQty > item.quantity) {
      throw new AppError(400, 'Invalid quantity', 'INVALID_QUANTITY');
    }

    await moveStackableItem(tx, item, withdrawQty, false);
  }) as unknown as void;
}

export async function depositBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ depositedCount: number }> {
  return prisma.$transaction(async (tx) => {
    let depositedCount = 0;
    for (const itemId of itemIds) {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { template: true, equipment: true },
      });
      if (!item || item.ownerId !== playerId) continue;
      if (item.equipment.length > 0) continue;
      if (item.inStash) continue;
      await moveStackableItem(tx, item, item.quantity, true);
      depositedCount++;
    }
    return { depositedCount };
  });
}

export async function withdrawBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ withdrawnCount: number }> {
  let { availableSlots } = await getInventoryState(playerId);

  return prisma.$transaction(async (tx) => {
    let withdrawnCount = 0;
    for (const itemId of itemIds) {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { template: true },
      });
      if (!item || item.ownerId !== playerId) continue;
      if (!item.inStash) continue;

      // Stackable items that merge into an existing backpack stack don't consume a slot
      const willMerge = item.template.stackable && await tx.item.findFirst({
        where: { ownerId: playerId, templateId: item.templateId, inStash: false },
        select: { id: true },
      });
      if (!willMerge && availableSlots <= 0) break;

      await moveStackableItem(tx, item, item.quantity, false);
      withdrawnCount++;
      if (!willMerge) availableSlots--;
    }
    return { withdrawnCount };
  });
}

export async function listStash(playerId: string) {
  return prisma.item.findMany({
    where: { ownerId: playerId, inStash: true },
    include: { template: true },
  });
}
