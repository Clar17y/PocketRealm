import { Router } from 'express';
import { Prisma, prisma } from '@pocketrealm/database';
import { createActivityLog } from '../../services/activityLogService';
import {
  CRAFTING_CONSTANTS,
  GUILD_CONSTANTS,
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
} from '@pocketrealm/shared';
import {
  calculateCraftingCrit,
  rollBonusStatsForRarity,
} from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { asyncHandler } from '../../utils/asyncHandler';
import { getEquipmentStats } from '../../services/equipmentService';
import { consumeItemsByTemplateTx, getTotalQuantityByTemplate, getInventoryState } from '../../services/inventoryService';
import { grantSkillXp } from '../../services/xpService';
import { addGuildXp, getPlayerGuildId } from '../../services/guildService';
import { spendWithTaxTx, taxInfoFromResult } from '../../services/guildTaxService';
import { getPlayerGuildModifiers } from '../../services/guildUpgradeService';
import { incrementContractProgress } from '../../services/guildContractService';
import { serializeXpGrant, assertCanAct, trackAchievements } from '../../utils/routeHelpers.js';
import {
  prismaAny,
  isSkillType,
  isItemType,
  getSkillLevel,
  getZoneCraftingLevel,
  assertZoneAllowsCrafting,
  assertZoneAllowsRecipeLevel,
  parseMaterials,
  craftSchema,
} from './helpers';

export const craftRouter = Router();

/**
 * POST /api/v1/crafting/craft
 * Validate materials, spend turns, craft item, and grant XP.
 */
craftRouter.post('/', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = craftSchema.parse(req.body);

    // Pre-flight: not recovering, not over-encumbered
    await assertCanAct(playerId);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const recipe = await prismaAny.craftingRecipe.findUnique({
      where: { id: body.recipeId },
      include: { resultTemplate: true },
    }) as (null | {
      id: string;
      skillType: string;
      requiredLevel: number;
      resultTemplateId: string;
      isAdvanced?: boolean;
      soulbound?: boolean;
      mobFamilyId?: string | null;
      turnCost: number;
      materials: unknown;
      xpReward: number;
      resultTemplate: any;
    });
    if (!recipe) {
      throw new AppError(404, 'Recipe not found', 'NOT_FOUND');
    }

    if (!isSkillType(recipe.skillType)) {
      throw new AppError(400, 'Recipe has invalid skillType', 'INVALID_RECIPE');
    }

    const skillLevel = await getSkillLevel(playerId, recipe.skillType);
    if (skillLevel < recipe.requiredLevel) {
      throw new AppError(400, 'Insufficient crafting level', 'INSUFFICIENT_LEVEL');
    }
    assertZoneAllowsRecipeLevel(zone, recipe.requiredLevel);
    if (recipe.isAdvanced) {
      const unlocked = await prismaAny.playerRecipe.findUnique({
        where: {
          playerId_recipeId: {
            playerId,
            recipeId: recipe.id,
          },
        },
        select: { recipeId: true },
      });
      if (!unlocked) {
        throw new AppError(403, 'Advanced recipe is not unlocked yet', 'RECIPE_NOT_UNLOCKED');
      }
    }

    const quantity = body.quantity;
    const materials = parseMaterials(recipe.materials);

    // Validate inventory has all materials
    for (const mat of materials) {
      const needed = mat.quantity * quantity;
      const available = await getTotalQuantityByTemplate(playerId, mat.templateId);
      if (available < needed) {
        throw new AppError(400, 'Insufficient materials', 'INSUFFICIENT_ITEMS');
      }
    }

    // Check backpack capacity before spending turns
    if (recipe.resultTemplate.stackable) {
      const existingStack = await prisma.item.findFirst({
        where: { ownerId: playerId, templateId: recipe.resultTemplateId, inStash: false },
      });
      if (!existingStack) {
        const { availableSlots } = await getInventoryState(playerId);
        if (availableSlots < 1) {
          throw new AppError(400, 'Backpack is full. Make space before crafting.', 'BACKPACK_FULL');
        }
      }
    } else {
      const { availableSlots } = await getInventoryState(playerId);
      if (availableSlots < quantity) {
        throw new AppError(400, 'Backpack is full. Make space before crafting.', 'BACKPACK_FULL');
      }
    }

    const baseTurnCost = recipe.turnCost * quantity;
    const { turnSpend, taxResult } = await prisma.$transaction(async (tx) => {
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, baseTurnCost);

      for (const mat of materials) {
        await consumeItemsByTemplateTx(tx, playerId, mat.templateId, mat.quantity * quantity);
      }

      return { turnSpend: spent, taxResult: tax };
    });

    // Create result items (stack where possible)
    const craftedItemIds: string[] = [];
    const craftedItemDetails: Array<{
      id: string;
      isCrit: boolean;
      rarity: ItemRarity;
      bonusStats?: Record<string, number>;
    }> = [];
    const needsDurability = recipe.resultTemplate.itemType === 'weapon' || recipe.resultTemplate.itemType === 'armor';
    const levelBuckets = Math.floor((skillLevel - recipe.requiredLevel) / 10);
    const durabilityBonusPct = levelBuckets * CRAFTING_CONSTANTS.DURABILITY_BONUS_PER_10_LEVELS;
    const baseMax = recipe.resultTemplate.maxDurability;
    const craftedMax = needsDurability ? Math.floor(baseMax * (1 + durabilityBonusPct / 100)) : null;

    if (recipe.resultTemplate.stackable) {
      const existing = await prisma.item.findFirst({
        where: { ownerId: playerId, templateId: recipe.resultTemplateId, inStash: false },
        select: { id: true, quantity: true },
      });

      if (existing) {
        const updated = await prisma.item.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + quantity },
          select: { id: true },
        });
        craftedItemIds.push(updated.id);
      } else {
        const created = await prisma.item.create({
          data: {
            ownerId: playerId,
            templateId: recipe.resultTemplateId,
            rarity: 'common',
            quantity,
            maxDurability: craftedMax,
            currentDurability: craftedMax,
          } as any,
          select: { id: true },
        });
        craftedItemIds.push(created.id);
      }
    } else {
      const itemType: ItemType = isItemType(recipe.resultTemplate.itemType)
        ? recipe.resultTemplate.itemType
        : 'resource';
      const equipStats = await getEquipmentStats(playerId);
      const guildMods = await getPlayerGuildModifiers(playerId);
      const effectiveLuck = guildMods.craftingCrit > 0
        ? equipStats.luck + Math.floor(guildMods.craftingCrit / CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT)
        : equipStats.luck;
      const templateBaseStats = recipe.resultTemplate.baseStats as ItemStats | null | undefined;

      const templateSlot = (recipe.resultTemplate.slot as EquipmentSlot | null) ?? undefined;
      for (let i = 0; i < quantity; i++) {
        const critResult = calculateCraftingCrit({
          skillLevel,
          requiredLevel: recipe.requiredLevel,
          luckStat: effectiveLuck,
          itemType,
          baseStats: templateBaseStats,
          slot: templateSlot,
        });
        const rarity: ItemRarity = critResult.rarity;
        const rolledBonusStats = rollBonusStatsForRarity({
          itemType,
          rarity,
          baseStats: templateBaseStats,
          slot: templateSlot,
        });
        const bonusStats = rolledBonusStats
          ? (rolledBonusStats as Prisma.InputJsonObject)
          : undefined;
        const bonusEntries = Object.entries(rolledBonusStats ?? {})
          .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));

        const created = await prisma.item.create({
          data: {
            ownerId: playerId,
            templateId: recipe.resultTemplateId,
            rarity,
            quantity: 1,
            maxDurability: craftedMax,
            currentDurability: craftedMax,
            bonusStats,
          } as any,
          select: { id: true },
        });
        craftedItemIds.push(created.id);
        if (critResult.isCrit && bonusEntries.length > 0) {
          craftedItemDetails.push({
            id: created.id,
            isCrit: true,
            rarity,
            bonusStats: Object.fromEntries(bonusEntries),
          });
        } else {
          craftedItemDetails.push({ id: created.id, isCrit: false, rarity });
        }
      }
    }

    const xpGrant = await grantSkillXp(playerId, recipe.skillType, recipe.xpReward * quantity);

    // --- Guild XP & contract progress ---
    const guildId = await getPlayerGuildId(playerId);
    if (guildId) {
      await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_CRAFT * quantity);
      await incrementContractProgress(guildId, 'craft_items', quantity);
      const rareCount = craftedItemDetails.filter(
        (d) => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary',
      ).length;
      if (rareCount > 0) {
        await incrementContractProgress(guildId, 'craft_rare', rareCount);
      }
    }

    // --- Achievement tracking (counters + derived checks) ---
    const isRealCraft = recipe.resultTemplate.itemType !== 'resource';
    const craftCounters: Record<string, number> = { totalTurnsSpent: turnSpend.spent };
    if (isRealCraft) {
      craftCounters.totalCrafts = quantity;
      for (const item of craftedItemDetails) {
        if (item.rarity === 'rare') craftCounters.totalRaresCrafted = (craftCounters.totalRaresCrafted ?? 0) + 1;
        if (item.rarity === 'epic') craftCounters.totalEpicsCrafted = (craftCounters.totalEpicsCrafted ?? 0) + 1;
        if (item.rarity === 'legendary') craftCounters.totalLegendariesCrafted = (craftCounters.totalLegendariesCrafted ?? 0) + 1;
      }
    }
    const craftAchKeys: string[] = [];
    if (isRealCraft) craftAchKeys.push('totalCrafts');
    if (craftCounters.totalRaresCrafted) craftAchKeys.push('totalRaresCrafted');
    if (craftCounters.totalEpicsCrafted) craftAchKeys.push('totalEpicsCrafted');
    if (craftCounters.totalLegendariesCrafted) craftAchKeys.push('totalLegendariesCrafted');
    if (xpGrant.newLevel) craftAchKeys.push('highestSkillLevel');
    if (xpGrant.characterLevelAfter && xpGrant.characterLevelAfter > (xpGrant.characterLevelBefore ?? 0)) craftAchKeys.push('highestCharacterLevel');
    await trackAchievements(playerId, craftCounters, { statKeys: craftAchKeys });

    const log = await createActivityLog({
      playerId,
      activityType: 'crafting',
      turnsSpent: turnSpend.spent,
      result: {
        recipeId: recipe.id,
        skillType: recipe.skillType,
        requiredLevel: recipe.requiredLevel,
        quantity,
        turnCost: recipe.turnCost,
        materials,
        resultTemplateId: recipe.resultTemplateId,
        craftedItemIds,
        craftedItemDetails,
        durability: needsDurability
          ? { baseMax, durabilityBonusPct, craftedMax }
          : null,
        xp: serializeXpGrant(xpGrant),
      },
    });

    res.json({
      logId: log.id,
      turns: turnSpend,
      crafted: {
        recipeId: recipe.id,
        resultTemplateId: recipe.resultTemplateId,
        quantity,
        craftedItemIds,
      },
      craftedItemDetails,
      xp: serializeXpGrant(xpGrant),
      tax: taxInfoFromResult(taxResult),
    });
}));
