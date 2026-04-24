import { Prisma, prisma } from '@pocketrealm/database';
import { rollBonusStatsForRarity } from '@pocketrealm/game-engine';
import {
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
} from '@pocketrealm/shared';
import {
  buildInventoryStateUpdates,
  fetchInventoryMeta,
  fetchItemDTOs,
  fetchMaterialTotals,
} from '../stateUpdateHelpers';
import { addStackableItem } from '../inventoryService';
import { adminAudit } from './adminAuditService';

export interface ListAdminItemTemplatesInput {
  search?: string;
  type?: string;
}

export async function listAdminItemTemplates({ search, type }: ListAdminItemTemplatesInput) {
  const where: Prisma.ItemTemplateWhereInput = {};
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (type) {
    where.itemType = type;
  }

  return prisma.itemTemplate.findMany({
    where,
    orderBy: [{ itemType: 'asc' }, { tier: 'asc' }, { name: 'asc' }],
    take: 100,
  });
}

export async function grantAdminItem(
  playerId: string,
  { templateId, rarity, quantity }: { templateId: string; rarity: ItemRarity; quantity: number },
) {
  const template = await prisma.itemTemplate.findUniqueOrThrow({ where: { id: templateId } });

  if (template.stackable) {
    const result = await addStackableItem(playerId, templateId, quantity);
    const [addedDTOs, inventoryMeta, materialTotals] = await Promise.all([
      fetchItemDTOs([result.itemId]),
      fetchInventoryMeta(playerId),
      fetchMaterialTotals(playerId),
    ]);

    await adminAudit(playerId, 'grant_item', {
      templateId,
      templateName: template.name,
      rarity,
      quantity,
      stackable: true,
    });

    return {
      item: result,
      stateUpdates: buildInventoryStateUpdates({
        ...(result.created ? { added: addedDTOs } : { updated: addedDTOs }),
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals,
      }),
    };
  }

  const items = [];
  for (let index = 0; index < quantity; index += 1) {
    const bonusStats = rollBonusStatsForRarity({
      itemType: template.itemType as ItemType,
      rarity,
      baseStats: template.baseStats as ItemStats | null,
      slot: template.slot as EquipmentSlot | null,
    });

    const item = await prisma.item.create({
      data: {
        ownerId: playerId,
        templateId,
        rarity,
        quantity: 1,
        maxDurability: template.maxDurability,
        currentDurability: template.maxDurability,
        bonusStats: bonusStats ? (bonusStats as unknown as Prisma.InputJsonObject) : undefined,
      },
    });
    items.push(item);
  }

  const itemIds = items.map((item) => item.id);
  const [addedDTOs, inventoryMeta, materialTotals] = await Promise.all([
    fetchItemDTOs(itemIds),
    fetchInventoryMeta(playerId),
    fetchMaterialTotals(playerId),
  ]);

  await adminAudit(playerId, 'grant_item', {
    templateId,
    templateName: template.name,
    rarity,
    quantity,
    itemCount: items.length,
  });

  return {
    items,
    stateUpdates: buildInventoryStateUpdates({
      added: addedDTOs,
      inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      materialTotals,
    }),
  };
}
