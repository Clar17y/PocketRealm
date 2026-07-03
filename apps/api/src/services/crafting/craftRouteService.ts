import { Prisma, prisma } from '@pocketrealm/database';
import { logger } from '../../logger';
import { createActivityLog } from '../../services/activityLogService';
import { broadcastCraftActivity } from '../../services/chatActivityService';
import type { EventModifierBadge } from '../../services/worldEventService';
import {
  CRAFTING_CONSTANTS,
  CHAT_ACTIVITY_CONSTANTS,
  GUILD_CONSTANTS,
  ITEM_RARITY_CONSTANTS,
  PREMIUM_CONSTANTS,
  isRarityAtLeast,
  type CraftDestination,
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
} from '@pocketrealm/shared';
import {
  calculateCraftingCrit,
  calculateCraftMaxReservedBaseTurnCost,
  getAutoForgeMinimumOpenSlots,
  isAutoForgeEligibleItemType,
  rollBonusStatsForRarity,
  type UpgradeableRarity,
} from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { getEquipmentStats } from '../../services/equipmentService';
import { addStackableItemTx, consumeItemsByTemplateTx, getTotalQuantityByTemplate, getInventoryState } from '../../services/inventoryService';
import { fetchItemDTOs, fetchSkillDTOs, fetchCharacterProgression, fetchInventoryMeta, fetchMaterialTotals, buildInventoryStateUpdates } from '../../services/stateUpdateHelpers';
import { grantSkillXp } from '../../services/xpService';
import { addGuildXp, getPlayerGuildId } from '../../services/guildService';
import { assertCanSpendWithTaxTx, spendWithTaxTx, taxInfoFromResult } from '../../services/guildTaxService';
import { getPlayerGuildModifiers } from '../../services/guildUpgradeService';
import { getBuffValue, consumeBuffStandalone } from '../../services/buffService';
import { getHasActivePremiumEntitlement } from '../../services/premiumEntitlement';
import { trackProgress } from '../../services/progressService';
import { getPlayerProgressionState } from '../../services/attributesService';
import { serializeXpGrant, assertCanAct, assertNotRecovering, trackAchievements } from '../../utils/routeHelpers.js';
import {
  isSkillType,
  isItemType,
  getSkillLevel,
  getZoneCraftingLevel,
  assertZoneAllowsCrafting,
  assertZoneAllowsRecipeLevel,
  getRecipeDiscountedCost,
  parseMaterials,
  craftSchema,
} from './helpers';
import {
  addCraftedItemToAutoForge,
  createCraftAutoForgeAccumulator,
  finishCraftAutoForge,
  getAutoForgePersistedItemCount,
  type CraftVirtualItem,
} from './autoForgePlanner';
import { checkActivityLockout } from '../../services/expeditionLockoutService';
import {
  routeJson,
  type AuthenticatedRouteServiceRequest,
  type RouteServiceResponse,
} from '../../utils/routeServiceResponse';

function makeVirtualId(index: number): string {
  return `craft-${index}`;
}

function countRareOrBetter(details: Array<{ rarity: ItemRarity }>): number {
  return details.filter((d) => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary').length;
}

export async function craftItem(input: AuthenticatedRouteServiceRequest): Promise<RouteServiceResponse> {
    const playerId = input.player.playerId;
    const body = craftSchema.parse(input.body);
    const destination: CraftDestination = body.destination;

    await checkActivityLockout(playerId);

    if (destination === 'inventory') {
      await assertCanAct(playerId);
    } else {
      await assertNotRecovering(playerId);
    }

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
    const autoForgeTarget = body.autoForgeMinRarity;
    const itemType: ItemType = isItemType(recipe.resultTemplate.itemType)
      ? recipe.resultTemplate.itemType
      : 'resource';
    const autoForgeEnabled = autoForgeTarget !== null;
    const inventoryState = await getInventoryState(playerId);

    if (autoForgeEnabled && !isAutoForgeEligibleItemType(itemType, recipe.resultTemplate.stackable)) {
      throw new AppError(
        400,
        'Auto-forge can only be used on non-stackable weapon and armor recipes',
        'AUTO_FORGE_INELIGIBLE',
      );
    }

    if (autoForgeEnabled && destination === 'inventory') {
      const minimumSlots = getAutoForgeMinimumOpenSlots(autoForgeTarget);
      if (inventoryState.availableSlots < minimumSlots) {
        throw new AppError(
          400,
          `Auto-forge to ${autoForgeTarget}+ requires ${minimumSlots} open backpack slots`,
          'BACKPACK_FULL',
        );
      }
    }

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
    if (destination === 'inventory') {
      if (recipe.resultTemplate.stackable) {
        const existingStack = await prisma.item.findFirst({
          where: { ownerId: playerId, templateId: recipe.resultTemplateId, inStash: false },
        });
        if (!existingStack && inventoryState.availableSlots < 1) {
          throw new AppError(400, 'Backpack is full. Make space before crafting.', 'BACKPACK_FULL');
        }
      } else if (!autoForgeEnabled && inventoryState.availableSlots < quantity) {
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
    const upgradeCostsByRarity: Record<UpgradeableRarity, number> = {
      common: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.common),
      uncommon: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.uncommon),
      rare: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.rare),
      epic: await getRecipeDiscountedCost(playerId, recipe.resultTemplateId, ITEM_RARITY_CONSTANTS.UPGRADE_TURN_COST_BY_RARITY.epic),
    };
    const maxReservedBaseTurnCost = calculateCraftMaxReservedBaseTurnCost({
      craftAttempts: quantity,
      craftTurnCostPerAttempt: recipe.turnCost,
      autoForgeTarget,
      upgradeCostsByRarity,
    });

    // Pre-roll crit results for non-stackable items (pure functions, safe outside tx)
    let actualQuantity = quantity;
    let autoForgePlan: ReturnType<typeof finishCraftAutoForge> | null = null;
    let preRolledItems: Array<{
      rarity: ItemRarity;
      bonusStats: Prisma.InputJsonObject | undefined;
      isCrit: boolean;
      bonusEntries: [string, number][];
    }> | null = null;

    if (!recipe.resultTemplate.stackable) {
      const equipStats = await getEquipmentStats(playerId);
      const guildMods = await getPlayerGuildModifiers(playerId);
      const hasChampion = await getHasActivePremiumEntitlement(prisma, playerId);
      const progression = autoForgeEnabled ? await getPlayerProgressionState(playerId) : null;
      const championMultiplier = hasChampion ? PREMIUM_CONSTANTS.BONUS_MULTIPLIER : 1;
      const combinedCritBonus = guildMods.craftingCrit + shopCraftingCrit;
      const effectiveCraftLuck = combinedCritBonus > 0
        ? equipStats.luck + Math.floor(combinedCritBonus / CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT)
        : equipStats.luck;
      const forgeLuck = equipStats.luck + (progression?.attributes.luck ?? 0);
      const templateBaseStats = recipe.resultTemplate.baseStats as ItemStats | null | undefined;
      const templateSlot = (recipe.resultTemplate.slot as EquipmentSlot | null) ?? undefined;

      if (autoForgeEnabled) {
        const accumulator = createCraftAutoForgeAccumulator({
          targetRarity: autoForgeTarget,
          itemType,
          baseStats: templateBaseStats,
          slot: templateSlot,
          luckStat: forgeLuck,
          upgradeCostsByRarity,
        });

        for (let i = 0; i < quantity; i++) {
          const critResult = calculateCraftingCrit({
            skillLevel,
            requiredLevel: recipe.requiredLevel,
            luckStat: effectiveCraftLuck,
            itemType,
            baseStats: templateBaseStats,
            slot: templateSlot,
            championMultiplier,
          });
          const rolledBonusStats = rollBonusStatsForRarity({
            itemType,
            rarity: critResult.rarity,
            baseStats: templateBaseStats,
            slot: templateSlot,
          });
          const bonusEntries = Object.entries(rolledBonusStats ?? {})
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));

          const virtualItem: CraftVirtualItem = {
            virtualId: makeVirtualId(i + 1),
            rarity: critResult.rarity,
            bonusStats: rolledBonusStats ? (rolledBonusStats as Prisma.InputJsonObject) : undefined,
            isCrit: critResult.isCrit,
            bonusEntries,
          };
          addCraftedItemToAutoForge(accumulator, virtualItem);
          actualQuantity = i + 1;

          if (destination === 'inventory' && getAutoForgePersistedItemCount(accumulator) >= inventoryState.availableSlots) {
            break;
          }
        }

        autoForgePlan = finishCraftAutoForge(accumulator);
      } else {
        preRolledItems = [];
        for (let i = 0; i < quantity; i++) {
          const critResult = calculateCraftingCrit({
            skillLevel,
            requiredLevel: recipe.requiredLevel,
            luckStat: effectiveCraftLuck,
            itemType,
            baseStats: templateBaseStats,
            slot: templateSlot,
            championMultiplier,
          });
          const rolledBonusStats = rollBonusStatsForRarity({
            itemType,
            rarity: critResult.rarity,
            baseStats: templateBaseStats,
            slot: templateSlot,
          });
          const bonusStats = rolledBonusStats
            ? (rolledBonusStats as Prisma.InputJsonObject)
            : undefined;
          const bonusEntries = Object.entries(rolledBonusStats ?? {})
            .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
          preRolledItems.push({ rarity: critResult.rarity, bonusStats, isCrit: critResult.isCrit, bonusEntries });
        }
      }
    }

    // Single transaction: spend turns + consume materials + create items
    const { turnSpend, taxResult, newItemIds, updatedItemIds, craftedItemDetails, fullyConsumedIds, partiallyConsumedIds } = await prisma.$transaction(async (tx) => {
      const outputInStash = destination === 'stash';
      await assertCanSpendWithTaxTx(tx, playerId, maxReservedBaseTurnCost);
      const actualBaseTurnCost = recipe.turnCost * actualQuantity + (autoForgePlan?.summary.actualForgeTurnCost ?? 0);
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, actualBaseTurnCost);

      const allFullyConsumed: string[] = [];
      const allPartiallyConsumed: string[] = [];
      for (const mat of materials) {
        const consumeResult = await consumeItemsByTemplateTx(tx, playerId, mat.templateId, mat.quantity * actualQuantity);
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
        const added = await addStackableItemTx(
          tx,
          playerId,
          recipe.resultTemplateId,
          quantity,
          outputInStash,
        );
        if (added.created) {
          newItemIds.push(added.itemId);
        } else {
          updatedItemIds.push(added.itemId);
        }
      } else {
        const persistedVirtualItems = autoForgePlan?.allPersistedItems ?? preRolledItems!.map((rolled, index) => ({
          virtualId: makeVirtualId(index + 1),
          rarity: rolled.rarity,
          bonusStats: rolled.bonusStats,
          isCrit: rolled.isCrit,
          bonusEntries: rolled.bonusEntries,
        }));

        for (const virtualItem of persistedVirtualItems) {
          const created = await tx.item.create({
            data: {
              ownerId: playerId,
              templateId: recipe.resultTemplateId,
              rarity: virtualItem.rarity,
              quantity: 1,
              maxDurability: craftedMax,
              currentDurability: craftedMax,
              bonusStats: virtualItem.bonusStats ?? undefined,
              inStash: outputInStash,
            },
            select: { id: true },
          });
          newItemIds.push(created.id);
          if (virtualItem.isCrit && virtualItem.bonusEntries.length > 0) {
            itemDetails.push({
              id: created.id,
              isCrit: true,
              rarity: virtualItem.rarity,
              bonusStats: Object.fromEntries(virtualItem.bonusEntries),
            });
          } else {
            itemDetails.push({ id: created.id, isCrit: false, rarity: virtualItem.rarity });
          }
        }
      }

      return { turnSpend: spent, taxResult: tax, newItemIds, updatedItemIds, craftedItemDetails: itemDetails, fullyConsumedIds: allFullyConsumed, partiallyConsumedIds: allPartiallyConsumed };
    });

    const allCraftedItemIds = [...newItemIds, ...updatedItemIds];
    const backpackNewItemIds = destination === 'inventory' ? newItemIds : [];
    const backpackUpdatedOutputIds = destination === 'inventory' ? updatedItemIds : [];
    const autoForgeSummary = autoForgePlan
      ? {
          ...autoForgePlan.summary,
          maxReservedTurnCost: maxReservedBaseTurnCost,
        }
      : undefined;

    // Consume shop crafting crit buff (one use per craft action)
    if (shopCraftingCrit > 0) await consumeBuffStandalone(playerId, 'crafting_crit');

    const xpGrant = await grantSkillXp(playerId, recipe.skillType, recipe.xpReward * actualQuantity);

    logger.info({
      playerId,
      recipeId: recipe.id,
      rarity: craftedItemDetails[0]?.rarity ?? 'common',
    }, 'Item crafted');

    // --- Guild XP & contract/quest progress ---
    const guildId = await getPlayerGuildId(playerId);
    if (guildId) {
      await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_CRAFT * actualQuantity);
    }
    const craftQuestProgress = await trackProgress(playerId, 'craft_items', actualQuantity);
    const rareCount = countRareOrBetter(craftedItemDetails);
    if (rareCount > 0) {
      const rareQuestProgress = await trackProgress(playerId, 'craft_rare', rareCount);
      craftQuestProgress.push(...rareQuestProgress);
    }

    // --- Achievement tracking (counters + derived checks) ---
    const isRealCraft = recipe.resultTemplate.itemType !== 'resource';
    const craftCounters: Record<string, number> = { totalTurnsSpent: turnSpend.spent };
    if (isRealCraft) {
      craftCounters.totalCrafts = actualQuantity;
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
        quantity: actualQuantity,
        requestedQuantity: quantity,
        actualQuantity,
        destination,
        autoForge: autoForgeSummary ?? null,
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

    const bestCraft = craftedItemDetails
      .filter((item) => isRarityAtLeast(item.rarity, CHAT_ACTIVITY_CONSTANTS.MIN_CRAFT_RARITY))
      .sort(
        (a, b) => ITEM_RARITY_CONSTANTS.ORDER.indexOf(b.rarity) - ITEM_RARITY_CONSTANTS.ORDER.indexOf(a.rarity),
      )[0];

    if (bestCraft) {
      void broadcastCraftActivity({
        zoneId: zone.zoneId,
        actorPlayerId: playerId,
        actorUsername: input.player.username,
        itemName: recipe.resultTemplate.name,
        rarity: bestCraft.rarity,
        skillType: recipe.skillType,
      }).catch((error: unknown) => {
        logger.error({ err: error, playerId, recipeId: recipe.id }, 'Craft activity broadcast failed');
      });
    }

    const craftingBuffBadges: EventModifierBadge[] = [];
    if (shopCraftingCrit > 0) craftingBuffBadges.push({ title: 'Crafting Crit Scroll', effectType: 'crafting_crit_up', effectValue: shopCraftingCrit, isGlobal: false });

    const [inventoryAdded, inventoryUpdated, skills, characterProgression, inventoryMeta, materialTotals] = await Promise.all([
      fetchItemDTOs(backpackNewItemIds),
      fetchItemDTOs([...partiallyConsumedIds, ...backpackUpdatedOutputIds]),
      fetchSkillDTOs(playerId),
      fetchCharacterProgression(playerId),
      fetchInventoryMeta(playerId),
      fetchMaterialTotals(playerId),
    ]);

    return routeJson({
      logId: log.id,
      turns: turnSpend,
      crafted: {
        recipeId: recipe.id,
        resultTemplateId: recipe.resultTemplateId,
        quantity: actualQuantity,
        craftedItemIds: allCraftedItemIds,
      },
      craftedItemDetails,
      xp: serializeXpGrant(xpGrant),
      tax: taxInfoFromResult(taxResult),
      ...(autoForgeSummary ? { autoForge: autoForgeSummary } : {}),
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
}
