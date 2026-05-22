import { prisma, Prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';
import { getInventoryState, getStackIdentityKey } from './inventoryService';

type StackableMoveItem = {
  id: string;
  ownerId: string;
  templateId: string;
  rarity: string;
  quantity: number;
  bonusStats?: unknown;
  craftMarks?: unknown;
  template: { stackable: boolean };
};

export type StashMoveResult = {
  itemId: string;
  merged: boolean;
};

async function findMatchingTargetStack(
  tx: Prisma.TransactionClient,
  item: StackableMoveItem,
  targetInStash: boolean,
): Promise<{ id: string; quantity: number } | null> {
  const targetKey = getStackIdentityKey(item);
  const candidates = await tx.item.findMany({
    where: { ownerId: item.ownerId, templateId: item.templateId, inStash: targetInStash },
    select: { id: true, quantity: true, templateId: true, rarity: true, bonusStats: true, craftMarks: true },
  });

  return candidates.find((candidate) => getStackIdentityKey(candidate) === targetKey) ?? null;
}

// Shared logic for moving stackable items between backpack (inStash=false) and stash (inStash=true)
async function moveStackableItem(
  tx: Prisma.TransactionClient,
  item: StackableMoveItem,
  moveQty: number,
  targetInStash: boolean,
  knownTarget?: { id: string; quantity: number } | null,
): Promise<StashMoveResult> {
  if (!item.template.stackable) {
    await tx.item.update({ where: { id: item.id }, data: { inStash: targetInStash } });
    return { itemId: item.id, merged: false };
  }

  // Full stack move for stackable items: merge into existing target stack if one exists
  if (moveQty >= item.quantity) {
    const existingTarget = knownTarget ?? await findMatchingTargetStack(tx, item, targetInStash);
    if (existingTarget) {
      await tx.item.update({
        where: { id: existingTarget.id },
        data: { quantity: existingTarget.quantity + item.quantity },
      });
      await tx.item.delete({ where: { id: item.id } });
      return { itemId: existingTarget.id, merged: true };
    } else {
      await tx.item.update({ where: { id: item.id }, data: { inStash: targetInStash } });
      return { itemId: item.id, merged: false };
    }
  }

  // Partial stack split: reduce source, merge into or create target
  await tx.item.update({
    where: { id: item.id },
    data: { quantity: item.quantity - moveQty },
  });

  const existingTarget = knownTarget ?? await findMatchingTargetStack(tx, item, targetInStash);

  if (existingTarget) {
    await tx.item.update({
      where: { id: existingTarget.id },
      data: { quantity: existingTarget.quantity + moveQty },
    });
    return { itemId: existingTarget.id, merged: true };
  } else {
    const created = await tx.item.create({
      data: {
        ownerId: item.ownerId,
        templateId: item.templateId,
        rarity: item.rarity,
        quantity: moveQty,
        maxDurability: null,
        currentDurability: null,
        inStash: targetInStash,
        ...(item.bonusStats ? { bonusStats: item.bonusStats as Prisma.InputJsonValue } : {}),
        ...(item.craftMarks ? { craftMarks: item.craftMarks as Prisma.InputJsonValue } : {}),
      },
      select: { id: true },
    });
    return { itemId: created.id, merged: false };
  }
}

export async function depositItem(
  playerId: string,
  itemId: string,
  quantity?: number
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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
  });
}

export async function withdrawItem(
  playerId: string,
  itemId: string,
  quantity?: number
): Promise<StashMoveResult> {
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

    const matchingTarget = item.template.stackable
      ? await findMatchingTargetStack(tx, item, false)
      : null;
    if (!matchingTarget) {
      const { usedSlots, capacity } = await getInventoryState(playerId);
      if (usedSlots >= capacity) {
        throw new AppError(400, 'Backpack is full', 'BACKPACK_FULL');
      }
    }

    return moveStackableItem(tx, item, withdrawQty, false, matchingTarget);
  });
}

export async function depositBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ depositedCount: number; depositedItemIds: string[] }> {
  const uniqueIds = [...new Set(itemIds)];
  return prisma.$transaction(async (tx) => {
    // Batch-fetch all items in one query
    const items = await tx.item.findMany({
      where: { id: { in: uniqueIds } },
      include: { template: true, equipment: true },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    // Track which items were actually deposited so the route only reports those
    // as removed from the backpack; skipped items (equipped, already stashed,
    // or not owned) must stay in the inventory state.
    const depositedItemIds: string[] = [];
    for (const itemId of uniqueIds) {
      const item = itemMap.get(itemId);
      if (!item || item.ownerId !== playerId) continue;
      if (item.equipment.length > 0) continue;
      if (item.inStash) continue;
      await moveStackableItem(tx, item, item.quantity, true);
      depositedItemIds.push(itemId);
    }
    return { depositedCount: depositedItemIds.length, depositedItemIds };
  });
}

export async function withdrawBatch(
  playerId: string,
  itemIds: string[]
): Promise<{ withdrawnCount: number; addedItemIds: string[]; updatedItemIds: string[] }> {
  const uniqueIds = [...new Set(itemIds)];
  let { availableSlots } = await getInventoryState(playerId);

  return prisma.$transaction(async (tx) => {
    // Batch-fetch all items in one query
    const items = await tx.item.findMany({
      where: { id: { in: uniqueIds } },
      include: { template: true },
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));

    // Pre-fetch all existing backpack stacks for stackable items to check merge targets
    const stackableTemplateIds = items
      .filter((item) => item.template.stackable && item.inStash)
      .map((item) => item.templateId);
    const existingBackpackStacks = stackableTemplateIds.length > 0
      ? await tx.item.findMany({
          where: { ownerId: playerId, templateId: { in: stackableTemplateIds }, inStash: false },
          select: { id: true, templateId: true, rarity: true, bonusStats: true, craftMarks: true },
        })
      : [];
    const backpackStackSet = new Set(existingBackpackStacks.map((stack) => getStackIdentityKey(stack)));

    let withdrawnCount = 0;
    const addedItemIds: string[] = [];
    const updatedItemIds: string[] = [];
    for (const itemId of uniqueIds) {
      const item = itemMap.get(itemId);
      if (!item || item.ownerId !== playerId) continue;
      if (!item.inStash) continue;

      const itemStackKey = getStackIdentityKey(item);
      const willMerge = item.template.stackable && backpackStackSet.has(itemStackKey);
      if (!willMerge && availableSlots <= 0) break;

      const moveResult = await moveStackableItem(tx, item, item.quantity, false);
      withdrawnCount++;
      if (moveResult.merged) {
        updatedItemIds.push(moveResult.itemId);
      } else {
        addedItemIds.push(moveResult.itemId);
      }
      if (!willMerge) {
        availableSlots--;
        // Track newly created backpack stack so subsequent same-template items merge correctly
        if (item.template.stackable) backpackStackSet.add(itemStackKey);
      }
    }
    return {
      withdrawnCount,
      addedItemIds: [...new Set(addedItemIds)],
      updatedItemIds: [...new Set(updatedItemIds)],
    };
  });
}

export async function listStash(playerId: string) {
  return prisma.item.findMany({
    where: { ownerId: playerId, inStash: true },
    include: { template: true },
  });
}
