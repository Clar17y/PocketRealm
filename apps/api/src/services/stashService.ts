import { prisma } from '@adventure/database';
import { AppError } from '../middleware/errorHandler';
import { getUsedSlots, getPlayerCapacity } from './inventoryService';

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

    if (!item.template.stackable || depositQty >= item.quantity) {
      // Move entire item to stash
      await tx.item.update({ where: { id: itemId }, data: { inStash: true } });
    } else {
      // Split: reduce original stack, create new stash stack (or merge into existing)
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: item.quantity - depositQty },
      });

      // Check for existing stash stack of same template
      const existingStash = await tx.item.findFirst({
        where: { ownerId: playerId, templateId: item.templateId, inStash: true },
      });

      if (existingStash) {
        await tx.item.update({
          where: { id: existingStash.id },
          data: { quantity: existingStash.quantity + depositQty },
        });
      } else {
        await tx.item.create({
          data: {
            ownerId: playerId,
            templateId: item.templateId,
            rarity: item.rarity,
            quantity: depositQty,
            maxDurability: null,
            currentDurability: null,
            inStash: true,
          } as any,
        });
      }
    }
  }) as unknown as void;
}

export async function withdrawItem(
  playerId: string,
  itemId: string,
  quantity?: number
): Promise<void> {
  const [usedSlots, capacity] = await Promise.all([
    getUsedSlots(playerId),
    getPlayerCapacity(playerId),
  ]);

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

    if (!item.template.stackable || withdrawQty >= item.quantity) {
      // Move entire item out of stash
      await tx.item.update({ where: { id: itemId }, data: { inStash: false } });
    } else {
      // Split: reduce stash stack, add to backpack stack (or create new)
      await tx.item.update({
        where: { id: itemId },
        data: { quantity: item.quantity - withdrawQty },
      });

      const existingBackpack = await tx.item.findFirst({
        where: { ownerId: playerId, templateId: item.templateId, inStash: false },
      });

      if (existingBackpack) {
        await tx.item.update({
          where: { id: existingBackpack.id },
          data: { quantity: existingBackpack.quantity + withdrawQty },
        });
      } else {
        await tx.item.create({
          data: {
            ownerId: playerId,
            templateId: item.templateId,
            rarity: item.rarity,
            quantity: withdrawQty,
            maxDurability: null,
            currentDurability: null,
            inStash: false,
          } as any,
        });
      }
    }
  }) as unknown as void;
}

export async function listStash(playerId: string) {
  return prisma.item.findMany({
    where: { ownerId: playerId, inStash: true },
    include: { template: true },
  });
}
