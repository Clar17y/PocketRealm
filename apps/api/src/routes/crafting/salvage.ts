import { Router } from 'express';
import { Prisma, prisma } from '@pocketrealm/database';
import { createActivityLog } from '../../services/activityLogService';
import { CRAFTING_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { getOwnedItem, trackAchievements } from '../../utils/routeHelpers.js';
import { spendWithTaxTx, taxInfoFromResult } from '../../services/guildTaxService';
import { addStackableItemTx } from '../../services/inventoryService';
import { fetchItemDTOs, fetchInventoryMeta, fetchMaterialTotals, buildInventoryStateUpdates } from '../../services/stateUpdateHelpers';
import {
  getZoneCraftingLevel,
  assertZoneAllowsCrafting,
  parseMaterials,
  calculateSalvageMaterials,
  getRecipeDiscountedCost,
  salvageSchema,
  salvageBatchSchema,
} from './helpers';
import { checkExpeditionLockout, checkEncounterSiteLockout } from '../../services/expeditionLockoutService';

export const salvageRouter = Router();

/**
 * POST /api/v1/crafting/salvage
 * Salvage one crafted weapon/armor for a partial material refund.
 */
salvageRouter.post('/', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = salvageSchema.parse(req.body);

    await checkEncounterSiteLockout(playerId);
    await checkExpeditionLockout(playerId);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const item = await getOwnedItem(playerId, body.itemId, {
      requireWeaponOrArmor: true,
      requireNotStacked: true,
      requireNotEquipped: true,
    });
    if (item.isSoulbound) {
      throw new AppError(400, 'Soulbound items cannot be salvaged', 'ITEM_SOULBOUND');
    }
    const targetStash = Boolean(item.inStash);

    const recipe = await prisma.craftingRecipe.findFirst({
      where: { resultTemplateId: item.templateId },
      select: { id: true, materials: true, resultTemplateId: true },
    });

    if (!recipe) {
      throw new AppError(400, 'This item cannot be salvaged', 'NOT_SALVAGEABLE');
    }

    const salvageTurnCost = await getRecipeDiscountedCost(playerId, item.templateId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);

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

    const { turnSpend, taxResult, returned, addedItemIds, updatedItemIds } = await prisma.$transaction(async (tx) => {
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, salvageTurnCost);

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
      const addedItemIds: string[] = [];
      const updatedItemIds: string[] = [];

      for (const material of refundedMaterials) {
        const template = templateById.get(material.templateId);
        if (!template) {
          throw new AppError(400, 'Recipe references invalid material template', 'INVALID_RECIPE');
        }

        if (template.stackable) {
          const stack = await addStackableItemTx(tx, playerId, material.templateId, material.quantity, targetStash);
          if (stack.created) {
            addedItemIds.push(stack.itemId);
          } else {
            updatedItemIds.push(stack.itemId);
          }
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
              inStash: targetStash,
            },
            select: { id: true },
          });
          createdIds.push(created.id);
          addedItemIds.push(created.id);
        }

        minted.push({
          templateId: material.templateId,
          name: template.name,
          quantity: material.quantity,
          itemIds: createdIds,
        });
      }

      return { turnSpend: spent, taxResult: tax, returned: minted, addedItemIds, updatedItemIds };
    });

    // --- Achievement stat tracking ---
    await trackAchievements(playerId, { totalSalvages: 1 });

    const [addedDTOs, updatedDTOs, inventoryMeta, materialTotals, log] = await Promise.all([
      fetchItemDTOs(addedItemIds),
      fetchItemDTOs(updatedItemIds),
      fetchInventoryMeta(playerId),
      fetchMaterialTotals(playerId),
      createActivityLog({
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
        },
      }),
    ]);

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
      stateUpdates: buildInventoryStateUpdates({
        removed: [item.id],
        added: addedDTOs,
        updated: updatedDTOs,
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals,
      }),
    });
}));

/**
 * POST /api/v1/crafting/salvage/batch
 * Salvage multiple items in one transaction.
 */
salvageRouter.post('/batch', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = salvageBatchSchema.parse(req.body);

    await checkEncounterSiteLockout(playerId);
    await checkExpeditionLockout(playerId);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    // Fetch all items with templates
    const items = await prisma.item.findMany({
      where: {
        id: { in: body.itemIds },
        ownerId: playerId,
        quantity: 1,
      },
      include: { template: true },
    });

    // Filter to weapon/armor only and not equipped
    const equippedItemIds = new Set(
      (await prisma.playerEquipment.findMany({
        where: { playerId, itemId: { in: items.map((i) => i.id) } },
        select: { itemId: true },
      })).map((e) => e.itemId),
    );

    const salvageableItems = items.filter((item) =>
      (item.template.itemType === 'weapon' || item.template.itemType === 'armor')
      && !equippedItemIds.has(item.id)
      && !item.isSoulbound
    );

    if (salvageableItems.length === 0) {
      throw new AppError(400, 'No salvageable items in selection', 'NO_SALVAGEABLE_ITEMS');
    }

    // Get unique template IDs and find recipes
    const uniqueTemplateIds = [...new Set<string>(salvageableItems.map((i) => i.templateId))];
    const recipes = await prisma.craftingRecipe.findMany({
      where: { resultTemplateId: { in: uniqueTemplateIds } },
      select: { id: true, resultTemplateId: true, materials: true },
    });
    const recipeByTemplateId = new Map(recipes.map((r) => [r.resultTemplateId, r]));

    // Build per-item salvage plan
    type SalvagePlan = {
      item: typeof items[number];
      recipe: typeof recipes[number];
      turnCost: number;
      refundedMaterials: Array<{ templateId: string; quantity: number }>;
    };
    const plans: SalvagePlan[] = [];

    for (const item of salvageableItems) {
      const recipe = recipeByTemplateId.get(item.templateId);
      if (!recipe) continue;

      const recipeMaterials = parseMaterials(recipe.materials);
      const refunded = calculateSalvageMaterials(recipeMaterials);
      if (refunded.length === 0) continue;

      const turnCost = await getRecipeDiscountedCost(playerId, item.templateId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);
      plans.push({ item, recipe, turnCost, refundedMaterials: refunded });
    }

    if (plans.length === 0) {
      throw new AppError(400, 'No salvageable items in selection', 'NO_SALVAGEABLE_ITEMS');
    }

    const totalTurnCost = plans.reduce((sum, p) => sum + p.turnCost, 0);

    // Aggregate all materials across all items, split by source location
    const materialTotals = new Map<string, { backpack: number; stash: number }>();
    for (const plan of plans) {
      const isStash = Boolean(plan.item.inStash);
      for (const mat of plan.refundedMaterials) {
        const entry = materialTotals.get(mat.templateId) ?? { backpack: 0, stash: 0 };
        if (isStash) entry.stash += mat.quantity;
        else entry.backpack += mat.quantity;
        materialTotals.set(mat.templateId, entry);
      }
    }

    // Fetch material templates
    const materialTemplates = await prisma.itemTemplate.findMany({
      where: { id: { in: [...materialTotals.keys()] } },
      select: { id: true, name: true, itemType: true, stackable: true, maxDurability: true },
    });
    const templateById = new Map(materialTemplates.map((t) => [t.id, t]));

    // Single transaction: spend turns, delete items, mint materials
    const { turnSpend, taxResult, returned, addedItemIds, updatedItemIds } = await prisma.$transaction(async (tx) => {
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, totalTurnCost);

      const deleted = await tx.item.deleteMany({
        where: {
          id: { in: plans.map((p) => p.item.id) },
          ownerId: playerId,
        },
      });
      if (deleted.count !== plans.length) {
        throw new AppError(409, 'Some items are no longer available', 'SALVAGE_ITEMS_UNAVAILABLE');
      }

      const minted: Array<{ templateId: string; name: string; quantity: number }> = [];
      const addedItemIds: string[] = [];
      const updatedItemIds: string[] = [];

      for (const [templateId, totals] of materialTotals) {
        const template = templateById.get(templateId);
        if (!template) {
          throw new AppError(400, 'Recipe references invalid material template', 'INVALID_RECIPE');
        }

        const totalQty = totals.backpack + totals.stash;

        for (const [qty, inStash] of [[totals.backpack, false], [totals.stash, true]] as const) {
          if (qty <= 0) continue;
          if (template.stackable) {
            const stack = await addStackableItemTx(tx, playerId, templateId, qty, inStash);
            if (stack.created) {
              addedItemIds.push(stack.itemId);
            } else {
              updatedItemIds.push(stack.itemId);
            }
          } else {
            const needsDurability = template.itemType === 'weapon' || template.itemType === 'armor';
            const maxDurability = needsDurability ? template.maxDurability : null;
            for (let i = 0; i < qty; i++) {
              const created = await tx.item.create({
                data: {
                  ownerId: playerId,
                  templateId,
                  rarity: 'common',
                  quantity: 1,
                  maxDurability,
                  currentDurability: maxDurability,
                  inStash,
                },
                select: { id: true },
              });
              addedItemIds.push(created.id);
            }
          }
        }

        minted.push({ templateId, name: template.name, quantity: totalQty });
      }

      return { turnSpend: spent, taxResult: tax, returned: minted, addedItemIds, updatedItemIds };
    });

    await trackAchievements(playerId, { totalSalvages: plans.length });

    const salvagedItemIds = plans.map((p) => p.item.id);
    const [addedDTOs, updatedDTOs, inventoryMeta, matTotals, log] = await Promise.all([
      fetchItemDTOs(addedItemIds),
      fetchItemDTOs(updatedItemIds),
      fetchInventoryMeta(playerId),
      fetchMaterialTotals(playerId),
      createActivityLog({
        playerId,
        activityType: 'salvage_batch',
        turnsSpent: turnSpend.spent,
        result: {
          itemCount: plans.length,
          salvaged: plans.map((p) => ({
            itemId: p.item.id,
            templateId: p.item.templateId,
            turnCost: p.turnCost,
          })),
          returnedMaterials: returned,
        },
      }),
    ]);

    res.json({
      logId: log.id,
      turns: turnSpend,
      salvaged: plans.map((p) => ({
        itemId: p.item.id,
        templateName: p.item.template.name,
        turnCost: p.turnCost,
      })),
      returnedMaterials: returned,
      totalTurnCost,
      tax: taxInfoFromResult(taxResult),
      stateUpdates: buildInventoryStateUpdates({
        removed: salvagedItemIds,
        added: addedDTOs,
        updated: updatedDTOs,
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        materialTotals: matTotals,
      }),
    });
}));
