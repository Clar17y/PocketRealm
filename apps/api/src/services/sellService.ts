import { prisma } from '@adventure/database';
import { calculateSellPrice } from '@adventure/game-engine';
import type { ItemRarity } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';

export async function sellItem(
  playerId: string,
  itemId: string,
  quantity?: number
): Promise<{ goldEarned: number; newGold: number }> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.item.findUnique({
      where: { id: itemId },
      include: { template: true, equipment: true },
    });
    if (!item || item.ownerId !== playerId) throw new AppError(404, 'Item not found', 'NOT_FOUND');
    if (item.equipment.length > 0) throw new AppError(400, 'Cannot sell equipped items', 'ITEM_EQUIPPED');
    if (!item.template.sellPrice) throw new AppError(400, 'Item cannot be sold', 'NOT_SELLABLE');

    const sellQty = quantity ?? item.quantity;
    if (sellQty > item.quantity || sellQty <= 0) throw new AppError(400, 'Invalid quantity', 'INVALID_QUANTITY');

    const unitPrice = calculateSellPrice({
      baseSellPrice: item.template.sellPrice,
      rarity: item.rarity as ItemRarity,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
    });
    const goldEarned = unitPrice * sellQty;

    if (sellQty >= item.quantity) {
      await tx.item.delete({ where: { id: itemId } });
    } else {
      await tx.item.update({ where: { id: itemId }, data: { quantity: item.quantity - sellQty } });
    }

    const player = await tx.player.update({
      where: { id: playerId },
      data: { gold: { increment: goldEarned } },
      select: { gold: true },
    });

    return { goldEarned, newGold: player.gold };
  });
}

export async function sellBulk(
  playerId: string,
  itemIds: string[]
): Promise<{ totalGoldEarned: number; newGold: number; soldCount: number }> {
  return prisma.$transaction(async (tx) => {
    let totalGold = 0;
    let soldCount = 0;

    for (const itemId of itemIds) {
      const item = await tx.item.findUnique({
        where: { id: itemId },
        include: { template: true, equipment: true },
      });
      if (!item || item.ownerId !== playerId) continue;
      if (item.equipment.length > 0) continue;
      if (!item.template.sellPrice) continue;

      const unitPrice = calculateSellPrice({
        baseSellPrice: item.template.sellPrice,
        rarity: item.rarity as ItemRarity,
        currentDurability: item.currentDurability,
        maxDurability: item.maxDurability,
      });
      totalGold += unitPrice * item.quantity;
      soldCount++;
      await tx.item.delete({ where: { id: itemId } });
    }

    const player = await tx.player.update({
      where: { id: playerId },
      data: { gold: { increment: totalGold } },
      select: { gold: true },
    });

    return { totalGoldEarned: totalGold, newGold: player.gold, soldCount };
  });
}
