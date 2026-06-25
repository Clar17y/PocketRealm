import { Prisma, prisma } from '@pocketrealm/database';
import type { ItemStats, VexExchangeListResponse, VexExchangeView, VexTargetOption } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { invalidateEquipmentCache } from './equipmentService';
import { consumeItemsByTemplateTx, getInventoryState, getTotalQuantityByTemplate } from './inventoryService';
import {
  VEX_EXCHANGES,
  type VexAugmentType,
  type VexExchangeDefinition,
  type VexTargetRule,
} from './vexExchangeDefinitions';

interface PurchaseParams {
  targetItemId?: string;
}

export interface VexPurchaseServiceResult {
  exchangeKey: string;
  message: string;
  invalidatesEquipment: boolean;
  addedItemIds: string[];
  updatedItemIds: string[];
  removedItemIds: string[];
}

type VexClient = Prisma.TransactionClient | typeof prisma;

interface ItemChangeIds {
  addedItemIds: string[];
  updatedItemIds: string[];
  removedItemIds: string[];
}

type TargetItem = NonNullable<Awaited<ReturnType<Prisma.TransactionClient['item']['findUnique']>>> & {
  template: {
    id: string;
    name: string;
    itemType: string;
    slot: string | null;
    tier: number;
    baseStats: Prisma.JsonValue;
    maxDurability: number;
  };
  itemAugments: Array<{ augmentType: string }>;
  equipment: Array<{ playerId: string; slot: string }>;
};

export async function listVexExchanges(playerId: string): Promise<VexExchangeListResponse> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { gold: true, seasonId: true },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const exchanges = await Promise.all(
    [...VEX_EXCHANGES]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((exchange) => toExchangeView(playerId, player.gold, player.seasonId, exchange)),
  );

  return { exchanges, gold: player.gold };
}

export async function purchaseVexExchange(
  playerId: string,
  exchangeKey: string,
  params: PurchaseParams,
): Promise<VexPurchaseServiceResult> {
  const exchange = VEX_EXCHANGES.find((candidate) => candidate.key === exchangeKey);
  if (!exchange) {
    throw new AppError(400, 'Invalid Vex exchange', 'INVALID_EXCHANGE');
  }

  await assertBackpackHasRoomForCreatedItem(playerId, exchange);

  const result = await prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id: playerId },
      select: { seasonId: true },
    });
    if (!player) {
      throw new AppError(404, 'Player not found', 'NOT_FOUND');
    }

    const purchaseResult = await applyExchangeEffect(tx, playerId, player.seasonId, exchange, params);
    const consumedItemChanges: ItemChangeIds = {
      addedItemIds: [],
      updatedItemIds: [],
      removedItemIds: [],
    };

    const goldUpdate = await tx.player.updateMany({
      where: { id: playerId, gold: { gte: exchange.goldCost } },
      data: { gold: { decrement: exchange.goldCost } },
    });
    if (goldUpdate.count !== 1) {
      throw new AppError(400, 'Not enough gold', 'INSUFFICIENT_GOLD');
    }

    for (const requirement of exchange.requiredItems) {
      const template = await findTemplateByName(tx, requirement.itemTemplateName, player.seasonId);
      const consumeResult = await consumeItemsByTemplateTx(tx, playerId, template.id, requirement.quantity);
      consumedItemChanges.updatedItemIds.push(...consumeResult.partiallyConsumedIds);
      consumedItemChanges.removedItemIds.push(...consumeResult.fullyConsumedIds);
    }

    const effectItemChanges = await purchaseResult.commit();
    const itemChanges = normalizeItemChangeIds(consumedItemChanges, effectItemChanges);

    return {
      exchangeKey: exchange.key,
      message: purchaseResult.message,
      invalidatesEquipment: purchaseResult.invalidatesEquipment,
      ...itemChanges,
    };
  });

  if (result.invalidatesEquipment) {
    await invalidateEquipmentCache(playerId);
  }

  return result;
}

async function assertBackpackHasRoomForCreatedItem(playerId: string, exchange: VexExchangeDefinition): Promise<void> {
  if (exchange.effect.type !== 'create_item') {
    return;
  }

  const { availableSlots } = await getInventoryState(playerId);
  if (availableSlots < 1) {
    throw new AppError(400, 'Backpack is full. Make space before trading with Vex.', 'BACKPACK_FULL');
  }
}

async function toExchangeView(
  playerId: string,
  playerGold: number,
  seasonId: string | null,
  exchange: VexExchangeDefinition,
): Promise<VexExchangeView> {
  const requiredItems = await Promise.all(
    exchange.requiredItems.map(async (requirement) => {
      const template = await findTemplateByName(prisma, requirement.itemTemplateName, seasonId);
      const ownedQuantity = await getTotalQuantityByTemplate(playerId, template.id);
      return {
        itemTemplateName: requirement.itemTemplateName,
        quantity: requirement.quantity,
        ownedQuantity,
      };
    }),
  );

  const targetOptions = await getTargetOptions(playerId, exchange.targetRule);
  const blockedReason = getBlockedReason(playerGold, exchange, requiredItems, targetOptions);

  return {
    key: exchange.key,
    name: exchange.name,
    description: exchange.description,
    preview: exchange.preview,
    category: exchange.category,
    goldCost: exchange.goldCost,
    playerGold,
    requiredItems,
    targetOptions,
    canPurchase: blockedReason === null,
    blockedReason,
    sortOrder: exchange.sortOrder,
  };
}

async function getTargetOptions(playerId: string, targetRule: VexTargetRule): Promise<VexTargetOption[]> {
  if (targetRule.type === 'none') {
    return [];
  }

  const ownedItems = await prisma.item.findMany({
    where: { ownerId: playerId, quantity: 1, inStash: false },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    include: {
      template: true,
      itemAugments: true,
      equipment: true,
    },
  });

  return ownedItems
    .filter((item) => matchesTargetRule(item, targetRule))
    .map((item) => ({
      itemId: item.id,
      itemName: item.template.name,
      slot: item.template.slot,
      rarity: item.rarity,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
      alreadyApplied: hasAugment(item, targetRule.augmentType),
      baseStats: toItemStats(item.template.baseStats),
      bonusStats: item.bonusStats === null ? null : toItemStats(item.bonusStats),
    }));
}

function getBlockedReason(
  playerGold: number,
  exchange: VexExchangeDefinition,
  requiredItems: Array<{ itemTemplateName: string; quantity: number; ownedQuantity: number }>,
  targetOptions: VexTargetOption[],
): string | null {
  if (playerGold < exchange.goldCost) {
    return 'Not enough gold';
  }

  const missingRequirement = requiredItems.find((requirement) => requirement.ownedQuantity < requirement.quantity);
  if (missingRequirement) {
    return `Not enough ${missingRequirement.itemTemplateName}`;
  }

  if (exchange.targetRule.type !== 'none') {
    if (targetOptions.length === 0) {
      return 'No eligible target item';
    }
    if (!targetOptions.some((option) => !option.alreadyApplied)) {
      return exchange.targetRule.augmentType
        ? 'No eligible target item without this augment'
        : 'No eligible target item';
    }
  }

  return null;
}

function matchesTargetRule(
  item: { template: { name: string; itemType: string; tier: number; maxDurability: number } },
  targetRule: VexTargetRule,
): boolean {
  if (targetRule.type === 'none') {
    return false;
  }

  if (targetRule.type === 'template') {
    return targetRule.templateNames.includes(item.template.name);
  }

  return (
    targetRule.itemTypes.includes(item.template.itemType as 'weapon' | 'armor') &&
    item.template.maxDurability > 0 &&
    item.template.tier >= targetRule.minTier &&
    item.template.tier <= targetRule.maxTier
  );
}

function hasAugment(item: { itemAugments?: Array<{ augmentType: string }> }, augmentType: VexAugmentType | undefined): boolean {
  return augmentType ? item.itemAugments?.some((augment) => augment.augmentType === augmentType) ?? false : false;
}

async function applyExchangeEffect(
  tx: Prisma.TransactionClient,
  playerId: string,
  seasonId: string | null,
  exchange: VexExchangeDefinition,
  params: PurchaseParams,
): Promise<{ message: string; invalidatesEquipment: boolean; commit: () => Promise<ItemChangeIds> }> {
  switch (exchange.effect.type) {
    case 'create_item': {
      const effect = exchange.effect;
      const template = await findTemplateByName(tx, effect.itemTemplateName, seasonId);
      return {
        message: `Created ${template.name}`,
        invalidatesEquipment: false,
        commit: async () => {
          const created = await tx.item.create({
            data: {
              ownerId: playerId,
              templateId: template.id,
              rarity: 'common',
              quantity: 1,
              maxDurability: template.maxDurability,
              currentDurability: template.maxDurability,
              isSoulbound: effect.soulbound,
            },
          });
          return { addedItemIds: [created.id], updatedItemIds: [], removedItemIds: [] };
        },
      };
    }

    case 'transform_item': {
      const effect = exchange.effect;
      const target = await requireTargetItem(tx, playerId, params.targetItemId);
      if (
        target.template.name !== effect.fromTemplateName ||
        !matchesTargetRule(target, exchange.targetRule)
      ) {
        throw new AppError(400, 'Invalid target item', 'INVALID_TARGET');
      }
      const toTemplate = await findTemplateByName(tx, effect.toTemplateName, seasonId);
      const invalidatesEquipment = isEquipped(target);

      return {
        message: `Created ${toTemplate.name}`,
        invalidatesEquipment,
        commit: async () => {
          const updated = await tx.item.updateMany({
            where: {
              id: target.id,
              ownerId: playerId,
              templateId: target.template.id,
              quantity: 1,
            },
            data: {
              templateId: toTemplate.id,
              maxDurability: toTemplate.maxDurability,
              currentDurability: toTemplate.maxDurability,
              bonusStats: Prisma.DbNull,
              isSoulbound: effect.soulbound,
            },
          });
          if (updated.count !== 1) {
            throw new AppError(400, 'Invalid target item', 'INVALID_TARGET');
          }
          return { addedItemIds: [], updatedItemIds: [target.id], removedItemIds: [] };
        },
      };
    }

    case 'reinforce_durability': {
      const effect = exchange.effect;
      const target = await requireTargetItem(tx, playerId, params.targetItemId);
      if (!matchesTargetRule(target, exchange.targetRule)) {
        throw new AppError(400, 'Invalid target item', 'INVALID_TARGET');
      }
      if (hasAugment(target, effect.augmentType)) {
        throw new AppError(400, 'Item has already been tempered', 'AUGMENT_ALREADY_APPLIED');
      }

      const previousMaxDurability = target.maxDurability ?? target.template.maxDurability;
      const reinforcedTemplateMax = Math.ceil(target.template.maxDurability * (1 + effect.bonusPercent));
      const newMaxDurability = Math.max(previousMaxDurability, reinforcedTemplateMax);
      const invalidatesEquipment = isEquipped(target);

      return {
        message: `${target.template.name} tempered`,
        invalidatesEquipment,
        commit: async () => {
          await tx.item.update({
            where: { id: target.id },
            data: { maxDurability: newMaxDurability, currentDurability: newMaxDurability },
          });
          try {
            await tx.itemAugment.create({
              data: {
                itemId: target.id,
                augmentType: effect.augmentType,
                sourceKey: exchange.key,
                metadata: { previousMaxDurability, newMaxDurability },
              },
            });
          } catch (error: unknown) {
            if (isPrismaUniqueViolation(error)) {
              throw new AppError(400, 'Item has already been tempered', 'AUGMENT_ALREADY_APPLIED');
            }
            throw error;
          }
          return { addedItemIds: [], updatedItemIds: [target.id], removedItemIds: [] };
        },
      };
    }

    case 'apply_bonus_stats': {
      const effect = exchange.effect;
      const target = await requireTargetItem(tx, playerId, params.targetItemId);
      if (
        exchange.targetRule.type !== 'template' ||
        !exchange.targetRule.templateNames.includes(target.template.name) ||
        !effect.eligibleTemplateNames.includes(target.template.name)
      ) {
        throw new AppError(400, 'Invalid target item', 'INVALID_TARGET');
      }
      if (hasAugment(target, effect.augmentType)) {
        throw new AppError(400, 'Item already has a boss stone', 'AUGMENT_ALREADY_APPLIED');
      }

      const mergedStats = mergeItemStats(target.bonusStats, effect.bonusStats);
      const invalidatesEquipment = isEquipped(target);

      return {
        message: `${exchange.name} applied to ${target.template.name}`,
        invalidatesEquipment,
        commit: async () => {
          await tx.item.update({
            where: { id: target.id },
            data: { bonusStats: mergedStats as Prisma.InputJsonObject },
          });
          try {
            await tx.itemAugment.create({
              data: {
                itemId: target.id,
                augmentType: effect.augmentType,
                sourceKey: exchange.key,
                metadata: { bonusStats: effect.bonusStats as Prisma.InputJsonObject },
              },
            });
          } catch (error: unknown) {
            if (isPrismaUniqueViolation(error)) {
              throw new AppError(400, 'Item already has a boss stone', 'AUGMENT_ALREADY_APPLIED');
            }
            throw error;
          }
          return { addedItemIds: [], updatedItemIds: [target.id], removedItemIds: [] };
        },
      };
    }
  }
}

function normalizeItemChangeIds(...changes: ItemChangeIds[]): ItemChangeIds {
  const added = new Set<string>();
  const updated = new Set<string>();
  const removed = new Set<string>();

  for (const change of changes) {
    for (const id of change.addedItemIds) added.add(id);
    for (const id of change.updatedItemIds) updated.add(id);
    for (const id of change.removedItemIds) removed.add(id);
  }

  for (const id of removed) {
    added.delete(id);
    updated.delete(id);
  }

  return {
    addedItemIds: [...added],
    updatedItemIds: [...updated],
    removedItemIds: [...removed],
  };
}

async function requireTargetItem(
  tx: Prisma.TransactionClient,
  playerId: string,
  targetItemId: string | undefined,
): Promise<TargetItem> {
  if (!targetItemId) {
    throw new AppError(400, 'Target item is required', 'TARGET_REQUIRED');
  }

  const target = await tx.item.findUnique({
    where: { id: targetItemId },
    include: {
      template: true,
      itemAugments: true,
      equipment: true,
    },
  });

  if (!target || target.ownerId !== playerId) {
    throw new AppError(404, 'Item not found', 'NOT_FOUND');
  }

  if (target.inStash) {
    throw new AppError(400, 'Cannot modify stashed items', 'ITEM_STASHED');
  }

  return target as TargetItem;
}

async function findTemplateByName(client: VexClient, name: string, seasonId: string | null): Promise<{
  id: string;
  name: string;
  maxDurability: number;
}> {
  if (seasonId) {
    const seasonTemplate = await client.itemTemplate.findFirst({
      where: { name, seasonId },
      select: { id: true, name: true, maxDurability: true },
    });
    if (seasonTemplate) {
      return seasonTemplate;
    }
  }

  const [template] = await client.itemTemplate.findMany({
    where: { name, seasonId: null },
    orderBy: [{ id: 'asc' }],
    take: 1,
    select: { id: true, name: true, maxDurability: true },
  });

  if (!template) {
    throw new AppError(500, `Item template not found for Vex exchange: ${name}`, 'CONFIG_ERROR');
  }

  return template;
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function isEquipped(item: { equipment?: Array<{ playerId: string; slot: string }> }): boolean {
  return (item.equipment?.length ?? 0) > 0;
}

function mergeItemStats(current: Prisma.JsonValue | null | undefined, bonus: ItemStats): ItemStats {
  const merged = toItemStats(current);
  for (const [key, value] of Object.entries(bonus)) {
    if (typeof value === 'number') {
      merged[key as keyof ItemStats] = (merged[key as keyof ItemStats] ?? 0) + value;
    }
  }
  return merged;
}

function toItemStats(value: Prisma.JsonValue | null | undefined): ItemStats {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const stats: ItemStats = {};
  for (const [key, statValue] of Object.entries(value)) {
    if (typeof statValue === 'number') {
      stats[key as keyof ItemStats] = statValue;
    }
  }
  return stats;
}
