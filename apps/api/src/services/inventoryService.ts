import { Prisma, prisma } from '@pocketrealm/database';
import { getInventoryCapacity } from '@pocketrealm/game-engine';
import type { ItemRarity } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { getHasActivePremiumEntitlement } from './premiumEntitlement';

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

export interface StackIdentityInput {
  templateId: string;
  rarity?: string | null;
  bonusStats?: unknown;
  craftMarks?: unknown;
}

type CanonicalJson =
  | null
  | string
  | number
  | boolean
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export function getStackIdentityKey(input: StackIdentityInput): string {
  return JSON.stringify({
    templateId: input.templateId,
    rarity: input.rarity ?? 'common',
    bonusStats: canonicalizeJson(input.bonusStats),
    craftMarks: canonicalizeCraftMarks(input.craftMarks),
  });
}

function canonicalizeJson(value: unknown): CanonicalJson {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (typeof value !== 'object') return null;

  const output: { [key: string]: CanonicalJson } = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = canonicalizeJson((value as Record<string, unknown>)[key]);
  }
  return output;
}

function canonicalizeCraftMarks(value: unknown): CanonicalJson {
  if (!Array.isArray(value) || value.length === 0) return null;

  const marks = value
    .filter((mark): mark is Record<string, unknown> => mark !== null && typeof mark === 'object' && !Array.isArray(mark))
    .map((mark) => ({
      markId: canonicalizeJson(mark.markId),
      name: canonicalizeJson(mark.name),
      sourceTechniqueId: canonicalizeJson(mark.sourceTechniqueId),
      description: canonicalizeJson(mark.description),
      itemStatBenefits: canonicalizeJson(mark.itemStatBenefits),
      itemStatDrawbacks: canonicalizeJson(mark.itemStatDrawbacks),
      actionModifiers: canonicalizeJson(mark.actionModifiers),
    }))
    .sort((left, right) => {
      const leftMark = typeof left.markId === 'string' ? left.markId : '';
      const rightMark = typeof right.markId === 'string' ? right.markId : '';
      if (leftMark !== rightMark) return leftMark.localeCompare(rightMark);
      const leftTechnique = typeof left.sourceTechniqueId === 'string' ? left.sourceTechniqueId : '';
      const rightTechnique = typeof right.sourceTechniqueId === 'string' ? right.sourceTechniqueId : '';
      return leftTechnique.localeCompare(rightTechnique);
    });

  return marks.length > 0 ? marks : null;
}

async function addStackableItemWithClient(
  client: InventoryClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number,
  inStash = false,
): Promise<{ itemId: string; quantity: number; created: boolean }> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive integer', 'INVALID_QUANTITY');
  }

  const template = await client.itemTemplate.findUnique({
    where: { id: itemTemplateId },
    select: { stackable: true },
  });
  if (!template) {
    throw new AppError(404, 'Item template not found', 'NOT_FOUND');
  }

  if (!template.stackable) {
    throw new AppError(400, 'Template is not stackable', 'NOT_STACKABLE');
  }

  const candidates = await client.item.findMany({
    where: { ownerId: playerId, templateId: itemTemplateId, inStash },
    select: { id: true, quantity: true, rarity: true, bonusStats: true, craftMarks: true },
  });
  const stackKey = getStackIdentityKey({ templateId: itemTemplateId, rarity: 'common', bonusStats: null, craftMarks: null });
  const existing = candidates.find((candidate) => (
    getStackIdentityKey({
      templateId: itemTemplateId,
      rarity: candidate.rarity,
      bonusStats: candidate.bonusStats,
      craftMarks: candidate.craftMarks,
    }) === stackKey
  ));

  if (existing) {
    const updated = await client.item.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + quantity },
      select: { id: true, quantity: true },
    });
    return { itemId: updated.id, quantity: updated.quantity, created: false };
  }

  const newItem = await client.item.create({
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
  return { itemId: newItem.id, quantity: newItem.quantity, created: true };
}

export async function addStackableItem(
  playerId: string,
  itemTemplateId: string,
  quantity: number,
  inStash = false,
): Promise<{ itemId: string; quantity: number; created: boolean }> {
  return addStackableItemWithClient(prisma, playerId, itemTemplateId, quantity, inStash);
}

export async function addStackableItemTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number,
  inStash = false,
): Promise<{ itemId: string; quantity: number; created: boolean }> {
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

export interface ConsumeItemsResult {
  fullyConsumedIds: string[];
  partiallyConsumedIds: string[];
}

async function consumeItemsByTemplateWithClient(
  client: InventoryClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number
): Promise<ConsumeItemsResult> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new AppError(400, 'Quantity must be a positive integer', 'INVALID_QUANTITY');
  }

  const items = await client.item.findMany({
    where: { ownerId: playerId, templateId: itemTemplateId },
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, quantity: true },
  });

  const fullyConsumedIds: string[] = [];
  const partiallyConsumedIds: string[] = [];

  let remaining = quantity;
  for (const item of items) {
    if (remaining <= 0) break;
    if (item.quantity > remaining) {
      await client.item.update({
        where: { id: item.id },
        data: { quantity: item.quantity - remaining },
      });
      partiallyConsumedIds.push(item.id);
      remaining = 0;
      break;
    }

    remaining -= item.quantity;
    await client.item.delete({ where: { id: item.id } });
    fullyConsumedIds.push(item.id);
  }

  if (remaining > 0) {
    throw new AppError(400, 'Insufficient materials', 'INSUFFICIENT_ITEMS');
  }

  return { fullyConsumedIds, partiallyConsumedIds };
}

export async function consumeItemsByTemplate(
  playerId: string,
  itemTemplateId: string,
  quantity: number
): Promise<ConsumeItemsResult> {
  return consumeItemsByTemplateWithClient(prisma, playerId, itemTemplateId, quantity);
}

export async function consumeItemsByTemplateTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  itemTemplateId: string,
  quantity: number
): Promise<ConsumeItemsResult> {
  return consumeItemsByTemplateWithClient(tx, playerId, itemTemplateId, quantity);
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
    select: { templateId: true, rarity: true, bonusStats: true, craftMarks: true, template: { select: { stackable: true } } },
  });

  const stackableKeys = new Set<string>();
  let count = 0;
  for (const item of items) {
    if (item.template.stackable) {
      const stackKey = getStackIdentityKey(item);
      if (!stackableKeys.has(stackKey)) {
        stackableKeys.add(stackKey);
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
  const [hasActivePremiumEntitlement, equipped] = await Promise.all([
    getHasActivePremiumEntitlement(prisma, playerId),
    prisma.playerEquipment.findMany({
      where: { playerId, slot: { in: ['backpack', 'belt'] }, itemId: { not: null } },
      select: {
        slot: true,
        item: {
          select: {
            rarity: true,
            bonusStats: true,
            template: { select: { tier: true } },
          },
        },
      },
    }),
  ]);

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

  return getInventoryCapacity({
    backpackTier,
    backpackRarity,
    beltSlotBonus,
    isChampion: hasActivePremiumEntitlement,
  });
}

