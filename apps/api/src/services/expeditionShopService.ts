import { prisma } from '@pocketrealm/database';
import { EXPEDITION_SHOP_ITEMS } from '@pocketrealm/shared/constants/expeditionDefinitions';
import {
  EXPEDITION_CONSTANTS,
  type ExpeditionShopItem,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { getInventoryState } from './inventoryService';

/** Returns the full expedition shop catalogue. */
export function getShopItems(): readonly ExpeditionShopItem[] {
  return EXPEDITION_SHOP_ITEMS;
}

/** Returns the player's current expedition token balance. */
export async function getPlayerTokens(playerId: string): Promise<number> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { expeditionTokens: true },
  });
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  return player.expeditionTokens;
}

/** Purchase a soulbound expedition shop item with tokens. */
export async function purchaseShopItem(
  playerId: string,
  itemId: string,
): Promise<{ item: { id: string; name: string; slot: string; rarity: string; isSoulbound: boolean }; tokensRemaining: number }> {
  // 1. Validate item exists in catalogue
  const shopItem = EXPEDITION_SHOP_ITEMS.find((i) => i.id === itemId);
  if (!shopItem) {
    throw new AppError(400, 'Invalid shop item', 'INVALID_ITEM');
  }

  // 2. Check token balance
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { expeditionTokens: true, currentZoneId: true },
  });
  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }
  if (player.expeditionTokens < shopItem.tokenCost) {
    throw new AppError(400, 'Insufficient expedition tokens', 'INSUFFICIENT_TOKENS');
  }

  // 3. Verify player is in a town zone
  if (!player.currentZoneId) {
    throw new AppError(400, 'Must be in a town to use the expedition shop', 'NOT_IN_TOWN');
  }
  const zone = await prisma.zone.findUnique({
    where: { id: player.currentZoneId },
    select: { zoneType: true },
  });
  if (!zone || zone.zoneType !== 'town') {
    throw new AppError(400, 'Must be in a town to use the expedition shop', 'NOT_IN_TOWN');
  }

  // 4. Check inventory capacity
  const { usedSlots, capacity } = await getInventoryState(playerId);
  if (usedSlots >= capacity) {
    throw new AppError(400, 'Inventory is full', 'INVENTORY_FULL');
  }

  // 5. Find the matching ItemTemplate (seeded for expedition gear)
  const template = await prisma.itemTemplate.findFirst({
    where: { name: shopItem.name },
  });
  if (!template) {
    throw new AppError(500, 'Item template not found — expedition shop items must be seeded', 'TEMPLATE_NOT_FOUND');
  }

  // 6. Transaction: deduct tokens + create soulbound item
  const durability = template.maxDurability * EXPEDITION_CONSTANTS.SOULBOUND_DURABILITY_MULTIPLIER;

  const result = await prisma.$transaction(async (tx) => {
    // Optimistic lock: only deduct if player still has enough tokens (prevents double-spend race)
    const deducted = await tx.player.updateMany({
      where: { id: playerId, expeditionTokens: { gte: shopItem.tokenCost } },
      data: { expeditionTokens: { decrement: shopItem.tokenCost } },
    });
    if (deducted.count === 0) {
      throw new AppError(400, 'Insufficient expedition tokens', 'INSUFFICIENT_TOKENS');
    }
    const updatedPlayer = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { expeditionTokens: true },
    });

    const item = await tx.item.create({
      data: {
        ownerId: playerId,
        templateId: template.id,
        rarity: 'epic',
        quantity: 1,
        maxDurability: durability,
        currentDurability: durability,
        bonusStats: shopItem.stats as Record<string, number>,
        isSoulbound: true,
      },
    });

    return { item, tokensRemaining: updatedPlayer.expeditionTokens };
  });

  return {
    item: {
      id: result.item.id,
      name: shopItem.name,
      slot: shopItem.slot,
      rarity: 'epic',
      isSoulbound: true,
    },
    tokensRemaining: result.tokensRemaining,
  };
}
