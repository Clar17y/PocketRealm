import { prisma } from '@adventure/database';
import { QUEST_SHOP_ITEMS, type QuestShopItem } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';

export function getShopInventory(): QuestShopItem[] {
  // For now, return all items. In the future, filter rotating items by week.
  return [...QUEST_SHOP_ITEMS];
}

export async function purchaseShopItem(playerId: string, itemKey: string): Promise<{ newBalance: number }> {
  const item = QUEST_SHOP_ITEMS.find(i => i.key === itemKey);
  if (!item) throw new AppError(400, 'Item not found', 'SHOP_ITEM_NOT_FOUND');

  const state = await prisma.playerQuestState.findUnique({ where: { playerId } });
  if (!state) throw new AppError(400, 'Quest state not found', 'QUEST_STATE_NOT_FOUND');
  if (state.questTokens < item.cost) throw new AppError(400, 'Not enough quest tokens', 'INSUFFICIENT_TOKENS');

  // Deduct tokens
  const updated = await prisma.playerQuestState.update({
    where: { playerId },
    data: { questTokens: { decrement: item.cost } },
  });

  // TODO: Grant the actual item to the player (integrate with inventoryService in future)
  // For now, just deduct tokens. Item granting will be wired up when shop items
  // are mapped to actual ItemTemplate IDs.

  return { newBalance: updated.questTokens };
}
