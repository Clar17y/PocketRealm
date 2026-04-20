import { Router } from 'express';
import { Prisma, prisma } from '@pocketrealm/database';
import { logger } from '../../logger';
import { createActivityLog } from '../../services/activityLogService';
import type { EventModifierBadge } from '../../services/worldEventService';
import {
  CRAFTING_CONSTANTS,
  GUILD_CONSTANTS,
  PREMIUM_CONSTANTS,
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
import { fetchItemDTOs, fetchSkillDTOs, fetchCharacterProgression, fetchInventoryMeta, fetchMaterialTotals, buildInventoryStateUpdates } from '../../services/stateUpdateHelpers';
import { grantSkillXp } from '../../services/xpService';
import { addGuildXp, getPlayerGuildId } from '../../services/guildService';
import { spendWithTaxTx, taxInfoFromResult } from '../../services/guildTaxService';
import { getPlayerGuildModifiers } from '../../services/guildUpgradeService';
import { getBuffValue, consumeBuffStandalone } from '../../services/buffService';
import { getHasActivePremiumEntitlement } from '../../services/premiumEntitlement';
import { trackProgress } from '../../services/progressService';
import { serializeXpGrant, assertCanAct, trackAchievements } from '../../utils/routeHelpers.js';
import {
  isSkillType,
  isItemType,
  getSkillLevel,
  getZoneCraftingLevel,
  assertZoneAllowsCrafting,
  assertZoneAllowsRecipeLevel,
  parseMaterials,
  craftSchema,
} from './helpers';
import { checkActivityLockout } from '../../services/expeditionLockoutService';
import { createEndpointLimiter } from '../../middleware/rateLimiter';

export const craftRouter = Router();
craftRouter.use(createEndpointLimiter('crafting', 60_000, 20));

/**
 * POST /api/v1/crafting/craft
 * Validate materials, spend turns, craft item, and grant XP.
 */
craftRouter.post('/', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = craftSchema.parse(req.body);

    await checkActivityLockout(playerId);

    // Pre-flight: not recovering, not over-encumbered
    await assertCanAct(playerId);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const recipe = await prisma.craftingRecipe.findUnique({
      where: { id: body.recipeId },
      include: { resultTemplate: true },
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
      const unlocked = await prisma.playerRecipe.findUnique({
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

    // Fetch shop crafting crit buff before transaction (read-only)
    const shopCraftingCrit = await getBuffValue(playerId, 'crafting_crit');

    // Pre-compute item properties outside transaction (pure RNG, no DB)
    const needsDurability = recipe.resultTemplate.itemType === 'weapon' || recipe.resultTemplate.itemType === 'armor';
    const levelBuckets = Math.floor((skillLevel - recipe.requiredLevel) / 10);
    const durabilityBonusPct = levelBuckets * CRAFTING_CONSTANTS.DURABILITY_BONUS_PER_10_LEVELS;
    const baseMax = recipe.resultTemplate.maxDurability;
    const craftedMax = needsDurability ? Math.floor(baseMax * (1 + durabilityBonusPct / 100)) : null;

    // Pre-roll crit results for non-stackable items (pure functions, safe outside tx)
    let preRolledItems: Array<{
      rarity: ItemRarity;
      bonusStats: Prisma.InputJsonObject | undefined;
      isCrit: boolean;
      bonusEntries: [string, number][];
    }> | null = null;

    if (!recipe.resultTemplate.stackable) {
      const itemType: ItemType = isItemType(recipe.resultTemplate.itemType)
        ? recipe.resultTemplate.itemType
        : 'resource';
      const equipStats = await getEquipmentStats(playerId);
      const guildMods = await getPlayerGuildModifiers(playerId);
      const hasChampion = await getHasActivePremiumEntitlement(prisma, playerId);
      const championMultiplier = hasChampion ? PREMIUM_CONSTANTS.BONUS_MULTIPLIER : 1;
      const combinedCritBonus = guildMods.craftingCrit + shopCraftingCrit;
      const effectiveLuck = combinedCritBonus > 0
        ? equipStats.luck + Math.floor(combinedCritBonus / CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT)
        : equipStats.luck;
      const templateBaseStats = recipe.resultTemplate.baseStats as ItemStats | null | undefined;
      const templateSlot = (recipe.resultTemplate.slot as EquipmentSlot | null) ?? undefined;

      preRolledItems = [];
      for (let i = 0; i < quantity; i++) {
        const critResult = calculateCraftingCrit({
          skillLevel,
          requiredLevel: recipe.requiredLevel,
          luckStat: effectiveLuck,
          itemType,
          baseStats: templateBaseStats,
          slot: templateSlot,
          championMultiplier,
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
        preRolledItems.push({ rarity, bonusStats, isCrit: critResult.isCrit, bonusEntries });
      }
    }

    // Single transaction: spend turns + consume materials + create items
    const baseTurnCost = recipe.turnCost * quantity;
    const { turnSpend, taxResult, newItemIds, updatedItemIds, craftedItemDetails, fullyConsumedIds, partiallyConsumedIds } = await prisma.$transaction(async (tx) => {
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, baseTurnCost);

      const allFullyConsumed: string[] = [];
      const allPartiallyConsumed: string[] = [];
      for (const mat of materials) {
        const consumeResult = await consumeItemsByTemplateTx(tx, playerId, mat.templateId, mat.quantity * quantity);
        allFullyConsumed.push(...consumeResult.fullyConsumedIds);
        allPartiallyConsumed.push(...consumeResult.partiallyConsumedIds);
      }

      const newItemIds: string[] = [];
      const updatedItemIds: string[] = [];
      const itemDetails: Array<{
        id: string;
        isCrit: boolean;
        rarity: ItemRarity;
        bonusStats?: Record<string, number>;
      }> = [];

      if (recipe.resultTemplate.stackable) {
        const existing = await tx.item.findFirst({
          where: { ownerId: playerId, templateId: recipe.resultTemplateId, inStash: false },
          select: { id: true, quantity: true },
        });

        if (existing) {
          const updated = await tx.item.update({
            where: { id: existing.id },
            data: { quantity: existing.quantity + quantity },
            select: { id: true },
          });
          updatedItemIds.push(updated.id);
        } else {
          const created = await tx.item.create({
            data: {
              ownerId: playerId,
              templateId: recipe.resultTemplateId,
              rarity: 'common',
              quantity,
              maxDurability: craftedMax,
              currentDurability: craftedMax,
            },
            select: { id: true },
          });
          newItemIds.push(created.id);
        }
      } else {
        for (const rolled of preRolledItems!) {
          const created = await tx.item.create({
            data: {
              ownerId: playerId,
              templateId: recipe.resultTemplateId,
              rarity: rolled.rarity,
              quantity: 1,
              maxDurability: craftedMax,
              currentDurability: craftedMax,
              bonusStats: rolled.bonusStats,
            },
            select: { id: true },
          });
          newItemIds.push(created.id);
          if (rolled.isCrit && rolled.bonusEntries.length > 0) {
            itemDetails.push({
              id: created.id,
              isCrit: true,
              rarity: rolled.rarity,
              bonusStats: Object.fromEntries(rolled.bonusEntries),
            });
          } else {
            itemDetails.push({ id: created.id, isCrit: false, rarity: rolled.rarity });
          }
        }
      }

      return { turnSpend: spent, taxResult: tax, newItemIds, updatedItemIds, craftedItemDetails: itemDetails, fullyConsumedIds: allFullyConsumed, partiallyConsumedIds: allPartiallyConsumed };
    });

    const allCraftedItemIds = [...newItemIds, ...updatedItemIds];

    // Consume shop crafting crit buff (one use per craft action)
    if (shopCraftingCrit > 0) await consumeBuffStandalone(playerId, 'crafting_crit');

    const xpGrant = await grantSkillXp(playerId, recipe.skillType, recipe.xpReward * quantity);

    logger.info({
      playerId,
      recipeId: recipe.id,
      rarity: craftedItemDetails[0]?.rarity ?? 'common',
    }, 'Item crafted');

    // --- Guild XP & contract/quest progress ---
    const guildId = await getPlayerGuildId(playerId);
    if (guildId) {
      await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_CRAFT * quantity);
    }
    const craftQuestProgress = await trackProgress(playerId, 'craft_items', quantity);
    const rareCount = craftedItemDetails.filter(
      (d) => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary',
    ).length;
    if (rareCount > 0) {
      const rareQuestProgress = await trackProgress(playerId, 'craft_rare', rareCount);
      craftQuestProgress.push(...rareQuestProgress);
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
        craftedItemIds: allCraftedItemIds,
        craftedItemDetails,
        durability: needsDurability
          ? { baseMax, durabilityBonusPct, craftedMax }
          : null,
        xp: serializeXpGrant(xpGrant),
      },
    });

    const craftingBuffBadges: EventModifierBadge[] = [];
    if (shopCraftingCrit > 0) craftingBuffBadges.push({ title: 'Crafting Crit Scroll', effectType: 'crafting_crit_up', effectValue: shopCraftingCrit, isGlobal: false });

    const [inventoryAdded, inventoryUpdated, skills, characterProgression, inventoryMeta, materialTotals] = await Promise.all([
      fetchItemDTOs(newItemIds),
      fetchItemDTOs([...partiallyConsumedIds, ...updatedItemIds]),
      fetchSkillDTOs(playerId),
      fetchCharacterProgression(playerId),
      fetchInventoryMeta(playerId),
      fetchMaterialTotals(playerId),
    ]);

    res.json({
      logId: log.id,
      turns: turnSpend,
      crafted: {
        recipeId: recipe.id,
        resultTemplateId: recipe.resultTemplateId,
        quantity,
        craftedItemIds: allCraftedItemIds,
      },
      craftedItemDetails,
      xp: serializeXpGrant(xpGrant),
      tax: taxInfoFromResult(taxResult),
      ...(craftQuestProgress.length > 0 ? { questProgress: craftQuestProgress } : {}),
      ...(craftingBuffBadges.length > 0 ? { activeEvents: craftingBuffBadges } : {}),
      stateUpdates: {
        ...buildInventoryStateUpdates({
          removed: fullyConsumedIds,
          added: inventoryAdded,
          updated: inventoryUpdated,
          inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
          materialTotals,
        }),
        skills,
        characterProgression,
      },
    });
}));
