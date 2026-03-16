import { Prisma, prisma } from '@pocketrealm/database';
import { getInventoryCapacity } from '@pocketrealm/game-engine';
import type { ItemRarity } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

interface InventoryClient {
  itemTemplate: {
    findUnique: Prisma.TransactionClient['itemTemplate']['findUnique'];
  };
  item: {
    findFirst: Prisma.TransactionClient['item']['findFirst'];
    findMany: Prisma.TransactionClient['item']['findMany'];
    update: Prisma.TransactionClient['item']['update'];
    create: Prisma.TransactionClient['item']['create'];
    delete: Prisma.TransactionClient['item']['delete'];
  };
}

async function addStackableItemWithClient(
  client: InventoryClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number,
  inStash = false,
): Promise<{ itemId: string; quantity: number }> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive integer', 'INVALID_QUANTITY');
  }

  const template = await client.itemTemplate.findUnique({ where: { id: itemTemplateId } });
  if (!template) {
    throw new AppError(404, 'Item template not found', 'NOT_FOUND');
  }

  if (!template.stackable) {
    throw new AppError(400, 'Template is not stackable', 'NOT_STACKABLE');
  }

  const existing = await client.item.findFirst({
    where: { ownerId: playerId, templateId: itemTemplateId, inStash },
    select: { id: true, quantity: true },
  });

  if (existing) {
    const updated = await client.item.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
      select: { id: true, quantity: true },
    });
    return { itemId: updated.id, quantity: updated.quantity };
  }

  const created = await client.item.create({
    data: {
      ownerId: playerId,
      templateId: itemTemplateId,
      rarity: 'common',
      quantity,
      maxDurability: null,
      currentDurability: null,
      inStash,
    },
    select: { id: true, quantity: true },
  });
  return { itemId: created.id, quantity: created.quantity };
}

export async function addStackableItem(
  playerId: string,
  itemTemplateId: string,
  quantity: number,
  inStash = false,
): Promise<{ itemId: string; quantity: number }> {
  return addStackableItemWithClient(prisma, playerId, itemTemplateId, quantity, inStash);
}

export async function addStackableItemTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number,
  inStash = false,
): Promise<{ itemId: string; quantity: number }> {
  return addStackableItemWithClient(tx, playerId, itemTemplateId, quantity, inStash);
}

export async function getTotalQuantityByTemplate(
  playerId: string,
  itemTemplateId: string
): Promise<number> {
  const items = await prisma.item.findMany({
    where: { ownerId: playerId, templateId: itemTemplateId },
    select: { quantity: true },
  });
  return items.reduce((sum: number, item: typeof items[number]) => sum + item.quantity, 0);
}

async function consumeItemsByTemplateWithClient(
  client: InventoryClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number
): Promise<void> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive integer', 'INVALID_QUANTITY');
  }

  const items = await client.item.findMany({
    where: { ownerId: playerId, templateId: itemTemplateId },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, quantity: true },
  });

  let remaining = quantity;
  for (const item of items) {
    if (remaining <= 0) break;
    if (item.quantity > remaining) {
      await client.item.update({
        where: { id: item.id },
        data: { quantity: item.quantity - remaining },
      });
      remaining = 0;
      break;
    }

    remaining -= item.quantity;
    await client.item.delete({ where: { id: item.id } });
  }

  if (remaining > 0) {
    throw new AppError(400, 'Insufficient materials', 'INSUFFICIENT_ITEMS');
  }
}

export async function consumeItemsByTemplate(
  playerId: string,
  itemTemplateId: string,
  quantity: number
): Promise<void> {
  await consumeItemsByTemplateWithClient(prisma, playerId, itemTemplateId, quantity);
}

export async function consumeItemsByTemplateTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number
): Promise<void> {
  await consumeItemsByTemplateWithClient(tx, playerId, itemTemplateId, quantity);
}

/** Fetch current slot usage and capacity in a single parallel call. */
export async function getInventoryState(playerId: string): Promise<{ usedSlots: number; capacity: number; availableSlots: number }> {
  const [usedSlots, capacity] = await Promise.all([
    getUsedSlots(playerId),
    getPlayerCapacity(playerId),
  ]);
  return { usedSlots, capacity, availableSlots: Math.max(0, capacity - usedSlots) };
}

/** Throws if player's used slots exceed capacity (over-encumbered). */
export async function assertNotOverEncumbered(playerId: string): Promise<void> {
  const { usedSlots, capacity } = await getInventoryState(playerId);
  if (usedSlots > capacity) {
    throw new AppError(
      400,
      'Over-encumbered! Drop, sell, stash, or salvage items to make space.',
      'OVER_ENCUMBERED',
    );
  }
}

/** Count occupied backpack slots (excludes equipped and stashed items). */
export async function getUsedSlots(playerId: string): Promise<number> {
  const items = await prisma.item.findMany({
    where: {
      ownerId: playerId,
      inStash: false,
      equipment: { none: {} },
    },
    select: { templateId: true, template: { select: { stackable: true } } },
  });

  const stackableTemplates = new Set<string>();
  let count = 0;
  for (const item of items) {
    if (item.template.stackable) {
      if (!stackableTemplates.has(item.templateId)) {
        stackableTemplates.add(item.templateId);
        count++;
      }
    } else {
      count++;
    }
  }
  return count;
}

/** Compute inventory capacity from equipped backpack + belt bonus. */
export async function getPlayerCapacity(playerId: string): Promise<number> {
  const equipped = await prisma.playerEquipment.findMany({
    where: { playerId, itemId: { not: null } },
    include: { item: { include: { template: true } } },
  });

  let backpackTier = 0;
  let backpackRarity: ItemRarity = 'common';
  let beltSlotBonus = 0;

  for (const slot of equipped) {
    if (slot.slot === 'backpack' && slot.item) {
      backpackTier = slot.item.template.tier;
      backpackRarity = slot.item.rarity as ItemRarity;
    }
    if (slot.slot === 'belt' && slot.item) {
      const bonus = slot.item.bonusStats as Record<string, number> | null;
      beltSlotBonus = bonus?.inventorySlots ?? 0;
    }
  }

  return getInventoryCapacity({ backpackTier, backpackRarity, beltSlotBonus, isChampion: false });
}

