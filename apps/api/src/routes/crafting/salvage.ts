import { Router } from 'express';
import { Prisma, prisma } from '@adventure/database';
import { CRAFTING_CONSTANTS } from '@adventure/shared';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { getOwnedItem, trackAchievements } from '../../utils/routeHelpers.js';
import { spendPlayerTurnsTx } from '../../services/turnBankService';
import { applyGuildTaxTx, getPlayerTaxRateTx, calculateInflatedCost, taxInfoFromResult } from '../../services/guildTaxService';
import { addStackableItemTx } from '../../services/inventoryService';
import {
  getZoneCraftingLevel,
  assertZoneAllowsCrafting,
  parseMaterials,
  calculateSalvageMaterials,
  salvageSchema,
} from './helpers';

export const salvageRouter = Router();

/**
 * POST /api/v1/crafting/salvage
 * Salvage one crafted weapon/armor for a partial material refund.
 */
salvageRouter.post('/', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = salvageSchema.parse(req.body);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const item = await getOwnedItem(playerId, body.itemId, {
      requireWeaponOrArmor: true,
      requireNotStacked: true,
      requireNotEquipped: true,
    });

    const recipe = await prisma.craftingRecipe.findFirst({
      where: { resultTemplateId: item.templateId },
      select: { id: true, materials: true, resultTemplateId: true },
    });

    if (!recipe) {
      throw new AppError(400, 'This item cannot be salvaged', 'NOT_SALVAGEABLE');
    }

    const recipeMaterials = parseMaterials(recipe.materials);
    const refundedMaterials = calculateSalvageMaterials(recipeMaterials);
    if (refundedMaterials.length === 0) {
      throw new AppError(400, 'No salvageable materials for this item', 'NOT_SALVAGEABLE');
    }

    const materialTemplates = await prisma.itemTemplate.findMany({
      where: { id: { in: refundedMaterials.map((material) => material.templateId) } },
      select: { id: true, name: true, itemType: true, stackable: true, maxDurability: true },
    });
    const templateById = new Map(materialTemplates.map((template) => [template.id, template]));

    const { turnSpend, taxResult, returned } = await prisma.$transaction(async (tx) => {
      const { taxRate } = await getPlayerTaxRateTx(tx, playerId);
      const actualSalvageCost = calculateInflatedCost(CRAFTING_CONSTANTS.SALVAGE_TURN_COST, taxRate);
      const spent = await spendPlayerTurnsTx(tx, playerId, actualSalvageCost);
      const tax = await applyGuildTaxTx(tx, playerId, actualSalvageCost);

      const consumed = await tx.item.deleteMany({
        where: {
          id: item.id,
          ownerId: playerId,
          quantity: 1,
        },
      });
      if (consumed.count !== 1) {
        throw new AppError(409, 'Item is no longer available to salvage', 'SALVAGE_ITEM_UNAVAILABLE');
      }

      const minted: Array<{
        templateId: string;
        name: string;
        quantity: number;
        itemIds: string[];
      }> = [];

      for (const material of refundedMaterials) {
        const template = templateById.get(material.templateId);
        if (!template) {
          throw new AppError(400, 'Recipe references invalid material template', 'INVALID_RECIPE');
        }

        if (template.stackable) {
          const stack = await addStackableItemTx(tx, playerId, material.templateId, material.quantity);
          minted.push({
            templateId: material.templateId,
            name: template.name,
            quantity: material.quantity,
            itemIds: [stack.itemId],
          });
          continue;
        }

        const createdIds: string[] = [];
        const needsDurability = template.itemType === 'weapon' || template.itemType === 'armor';
        const maxDurability = needsDurability ? template.maxDurability : null;
        for (let i = 0; i < material.quantity; i++) {
          const created = await tx.item.create({
            data: {
              ownerId: playerId,
              templateId: material.templateId,
              rarity: 'common',
              quantity: 1,
              maxDurability,
              currentDurability: maxDurability,
            } as any,
            select: { id: true },
          });
          createdIds.push(created.id);
        }

        minted.push({
          templateId: material.templateId,
          name: template.name,
          quantity: material.quantity,
          itemIds: createdIds,
        });
      }

      return { turnSpend: spent, taxResult: tax, returned: minted };
    });

    // --- Achievement stat tracking ---
    await trackAchievements(playerId, { totalSalvages: 1 });

    const log = await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'salvage',
        turnsSpent: turnSpend.spent,
        result: {
          salvagedItemId: item.id,
          salvagedTemplateId: item.templateId,
          salvageRecipeId: recipe.id,
          salvageRefundRate: CRAFTING_CONSTANTS.SALVAGE_BASE_REFUND_RATE,
          returnedMaterials: returned.map((entry) => ({
            templateId: entry.templateId,
            name: entry.name,
            quantity: entry.quantity,
            itemIds: entry.itemIds,
          })),
        } as unknown as Prisma.InputJsonValue,
      },
    });

    res.json({
      logId: log.id,
      turns: turnSpend,
      salvage: {
        salvagedItemId: item.id,
        salvagedTemplateId: item.templateId,
        returnedMaterials: returned.map((entry) => ({
          templateId: entry.templateId,
          name: entry.name,
          quantity: entry.quantity,
        })),
      },
      tax: taxInfoFromResult(taxResult),
    });
}));
