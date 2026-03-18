import { Router } from 'express';
import { Prisma, prisma } from '@pocketrealm/database';
import { createActivityLog } from '../../services/activityLogService';
import type { EquipmentSlot, ItemStats } from '@pocketrealm/shared';
import {
  calculateForgeUpgradeSuccessChance,
  getEligibleBonusStats,
  getForgeRerollCost,
  getForgeUpgradeCost,
  getNextRarity,
  rollBonusStat,
  rollBonusStatsForRarity,
} from '@pocketrealm/game-engine';
import { AppError } from '../../middleware/errorHandler';
import { getBuffValue, hasActiveBuff, consumeBuff, consumeBuffStandalone } from '../../services/buffService';
import { asyncHandler } from '../../utils/asyncHandler';
import { getEquipmentStats } from '../../services/equipmentService';
import { spendWithTaxTx, taxInfoFromResult } from '../../services/guildTaxService';
import { assertNotRecovering, getOwnedItem, trackAchievements } from '../../utils/routeHelpers.js';
import { toInventoryItemDTO, fetchInventoryMeta, fetchBuffDTOs } from '../../services/stateUpdateHelpers';
import {
  isItemType,
  parseItemRarity,
  normalizeBonusStats,
  getZoneCraftingLevel,
  assertZoneAllowsCrafting,
  getRecipeDiscountedCost,
  getValidatedSacrificialItem,
  forgeUpgradeSchema,
  forgeRerollSchema,
} from './helpers';

export const forgeRouter = Router();

/**
 * POST /api/v1/crafting/forge/upgrade
 * Attempt to upgrade item rarity by one tier. Failure destroys the item.
 */
forgeRouter.post('/upgrade', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = forgeUpgradeSchema.parse(req.body);

    await assertNotRecovering(playerId);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const item = await getOwnedItem(playerId, body.itemId, {
      requireWeaponOrArmor: true,
      requireNotStacked: true,
      requireNotEquipped: true,
    });

    const currentRarity = parseItemRarity(item.rarity);
    const nextRarity = getNextRarity(currentRarity);

    const baseUpgradeCost = getForgeUpgradeCost(currentRarity);
    if (!nextRarity || baseUpgradeCost === null) {
      throw new AppError(400, 'Legendary items cannot be upgraded', 'MAX_RARITY');
    }

    const upgradeCost = await getRecipeDiscountedCost(playerId, item.templateId, baseUpgradeCost);

    const sacrificial = await getValidatedSacrificialItem({
      playerId,
      targetItemId: item.id,
      sacrificialItemId: body.sacrificialItemId,
      rarity: currentRarity,
      itemType: item.template.itemType,
      action: 'upgrade',
    });

    const { turnSpend, taxResult } = await prisma.$transaction(async (tx) => {
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, upgradeCost);
      const consumed = await tx.item.deleteMany({
        where: {
          id: sacrificial.id,
          ownerId: playerId,
          quantity: 1,
        },
      });
      if (consumed.count !== 1) {
        throw new AppError(409, 'Sacrificial item is no longer available', 'FORGE_SACRIFICE_UNAVAILABLE');
      }
      return { turnSpend: spent, taxResult: tax };
    });
    const equipmentStats = await getEquipmentStats(playerId);
    const successChance = calculateForgeUpgradeSuccessChance(currentRarity, equipmentStats.luck);
    if (successChance === null) {
      throw new AppError(400, 'Legendary items cannot be upgraded', 'MAX_RARITY');
    }

    // Check forge buffs from quest shop
    const forgeLuckBonus = await getBuffValue(playerId, 'forge_luck');
    const hasForgeProtection = await hasActiveBuff(playerId, 'forge_protection');

    // forge_luck uses multiplicative bonus (2.0 = double chance), unlike other buffs which are additive
    let adjustedChance = successChance;
    if (forgeLuckBonus > 0) {
      adjustedChance = Math.min(1, adjustedChance * forgeLuckBonus);
    }

    const roll = Math.random();
    const success = roll < adjustedChance;

    // --- Achievement stat tracking ---
    await trackAchievements(playerId, { totalForgeUpgrades: 1 });

    const itemType = isItemType(item.template.itemType) ? item.template.itemType : null;
    if (!itemType) {
      throw new AppError(400, 'Item template has invalid type', 'INVALID_ITEM');
    }
    const templateBaseStats = item.template.baseStats as ItemStats | null | undefined;

    if (success) {
      const upgradeSlot = (item.template.slot as EquipmentSlot | null) ?? undefined;
      const eligibleStats = getEligibleBonusStats(itemType, templateBaseStats, upgradeSlot);
      if (eligibleStats.length === 0) {
        throw new AppError(400, 'No eligible bonus stats for this item', 'INVALID_ITEM');
      }

      const newRoll = rollBonusStat(eligibleStats, templateBaseStats);
      if (!newRoll) {
        throw new AppError(500, 'Failed to roll upgrade bonus stat', 'FORGE_ROLL_FAILED');
      }

      const existingBonusStats = normalizeBonusStats(item.bonusStats);
      const previousValue = existingBonusStats[newRoll.stat];
      const previousNumeric = typeof previousValue === 'number' && Number.isFinite(previousValue)
        ? previousValue
        : 0;
      const upgradedBonusStats: ItemStats = {
        ...existingBonusStats,
        [newRoll.stat]: previousNumeric + newRoll.value,
      };

      await prisma.item.update({
        where: { id: item.id },
        data: {
          rarity: nextRarity,
          bonusStats: upgradedBonusStats as Prisma.InputJsonObject,
        },
      });

      // Consume forge_luck on success (it modified the chance); forge_protection not consumed (wasn't needed)
      const [log, inventoryMeta] = await Promise.all([
        createActivityLog({
          playerId,
          activityType: 'forge_upgrade',
          turnsSpent: turnSpend.spent,
          result: {
            itemId: item.id,
            templateId: item.templateId,
            fromRarity: currentRarity,
            toRarity: nextRarity,
            success: true,
            successChance,
            adjustedChance,
            roll,
            luckStat: equipmentStats.luck,
            buffUsed: forgeLuckBonus > 0 ? 'forge_luck' : hasForgeProtection ? 'forge_protection' : null,
            sacrificialItem: {
              itemId: sacrificial.id,
              templateId: sacrificial.templateId,
              rarity: sacrificial.rarity,
            },
            previousBonusStats: item.bonusStats ?? null,
            addedBonusStat: newRoll.stat,
            addedBonusValue: newRoll.value,
            bonusStats: upgradedBonusStats,
          },
        }),
        fetchInventoryMeta(playerId),
      ]);

      if (forgeLuckBonus > 0) await consumeBuffStandalone(playerId, 'forge_luck');
      const buffs = (forgeLuckBonus > 0) ? await fetchBuffDTOs(playerId) : undefined;

      const updatedDTO = toInventoryItemDTO(
        { ...item, rarity: nextRarity, bonusStats: upgradedBonusStats },
        null,
      );

      res.json({
        logId: log.id,
        turns: turnSpend,
        forge: {
          action: 'upgrade',
          success: true,
          destroyed: false,
          protected: false,
          itemId: item.id,
          fromRarity: currentRarity,
          toRarity: nextRarity,
          successChance,
          adjustedChance,
          roll,
          sacrificialItemId: sacrificial.id,
          addedBonusStat: newRoll.stat,
          addedBonusValue: newRoll.value,
          bonusStats: upgradedBonusStats,
          buffUsed: forgeLuckBonus > 0 ? 'forge_luck' : hasForgeProtection ? 'forge_protection' : null,
        },
        tax: taxInfoFromResult(taxResult),
        stateUpdates: {
          inventoryRemoved: [sacrificial.id],
          inventoryUpdated: [updatedDTO],
          inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
          ...(buffs && { buffs }),
        },
      });
      return;
    }

    const destroyed = !hasForgeProtection;
    const destroyedItemSnapshot = {
      itemId: item.id,
      templateId: item.templateId,
      rarity: currentRarity,
      bonusStats: item.bonusStats ?? null,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
    };

    if (destroyed) {
      await prisma.item.delete({ where: { id: item.id } });
    }

    const removedIds = [sacrificial.id, ...(destroyed ? [item.id] : [])];

    const [log, inventoryMeta] = await Promise.all([
      createActivityLog({
        playerId,
        activityType: 'forge_upgrade',
        turnsSpent: turnSpend.spent,
        result: {
          itemId: item.id,
          templateId: item.templateId,
          fromRarity: currentRarity,
          toRarity: nextRarity,
          success: false,
          successChance,
          adjustedChance,
          roll,
          luckStat: equipmentStats.luck,
          buffUsed: hasForgeProtection ? 'forge_protection' : forgeLuckBonus > 0 ? 'forge_luck' : null,
          sacrificialItem: {
            itemId: sacrificial.id,
            templateId: sacrificial.templateId,
            rarity: sacrificial.rarity,
          },
          outcome: destroyed ? 'destroyed' : 'protected',
          destroyedItem: destroyed ? destroyedItemSnapshot : undefined,
        },
      }),
      fetchInventoryMeta(playerId),
    ]);

    // Consume buffs after failed forge
    const consumedBuff = forgeLuckBonus > 0 || hasForgeProtection;
    if (forgeLuckBonus > 0) await consumeBuffStandalone(playerId, 'forge_luck');
    if (hasForgeProtection) await consumeBuffStandalone(playerId, 'forge_protection');
    const buffs = consumedBuff ? await fetchBuffDTOs(playerId) : undefined;

    res.json({
      logId: log.id,
      turns: turnSpend,
      forge: {
        action: 'upgrade',
        success: false,
        destroyed,
        protected: hasForgeProtection,
        itemId: item.id,
        fromRarity: currentRarity,
        toRarity: nextRarity,
        successChance,
        adjustedChance,
        roll,
        sacrificialItemId: sacrificial.id,
        buffUsed: hasForgeProtection ? 'forge_protection' : forgeLuckBonus > 0 ? 'forge_luck' : null,
      },
      tax: taxInfoFromResult(taxResult),
      stateUpdates: {
        inventoryRemoved: removedIds,
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
        ...(buffs && { buffs }),
      },
    });
}));

/**
 * POST /api/v1/crafting/forge/reroll
 * Re-roll all bonus stats for an Uncommon+ unequipped weapon/armor item.
 */
forgeRouter.post('/reroll', asyncHandler(async (req, res) => {
    const playerId = req.player!.playerId;
    const body = forgeRerollSchema.parse(req.body);

    await assertNotRecovering(playerId);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const item = await getOwnedItem(playerId, body.itemId, {
      requireWeaponOrArmor: true,
      requireNotStacked: true,
      requireNotEquipped: true,
    });

    const rarity = parseItemRarity(item.rarity);
    const rerollCost = getForgeRerollCost(rarity);
    if (rerollCost === null) {
      throw new AppError(400, 'Only Uncommon+ items can be rerolled', 'MIN_RARITY_REQUIRED');
    }

    const sacrificial = await getValidatedSacrificialItem({
      playerId,
      targetItemId: item.id,
      sacrificialItemId: body.sacrificialItemId,
      rarity,
      templateId: item.templateId,
      action: 'reroll',
    });

    const itemType = isItemType(item.template.itemType) ? item.template.itemType : null;
    if (!itemType) {
      throw new AppError(400, 'Item template has invalid type', 'INVALID_ITEM');
    }
    const templateBaseStats = item.template.baseStats as ItemStats | null | undefined;

    const { turnSpend, taxResult } = await prisma.$transaction(async (tx) => {
      const { turnSpend: spent, taxResult: tax } = await spendWithTaxTx(tx, playerId, rerollCost);
      const consumed = await tx.item.deleteMany({
        where: {
          id: sacrificial.id,
          ownerId: playerId,
          quantity: 1,
        },
      });
      if (consumed.count !== 1) {
        throw new AppError(409, 'Sacrificial item is no longer available', 'FORGE_SACRIFICE_UNAVAILABLE');
      }
      return { turnSpend: spent, taxResult: tax };
    });
    const rerollSlot = (item.template.slot as EquipmentSlot | null) ?? undefined;
    const rerolledBonusStats = rollBonusStatsForRarity({
      itemType,
      rarity,
      baseStats: templateBaseStats,
      slot: rerollSlot,
    });

    await prisma.item.update({
      where: { id: item.id },
      data: {
        bonusStats: rerolledBonusStats ? (rerolledBonusStats as Prisma.InputJsonObject) : Prisma.DbNull,
      },
    });

    const [log, inventoryMeta] = await Promise.all([
      createActivityLog({
        playerId,
        activityType: 'forge_reroll',
        turnsSpent: turnSpend.spent,
        result: {
          itemId: item.id,
          templateId: item.templateId,
          rarity,
          sacrificialItem: {
            itemId: sacrificial.id,
            templateId: sacrificial.templateId,
            rarity: sacrificial.rarity,
          },
          previousBonusStats: item.bonusStats ?? null,
          bonusStats: rerolledBonusStats ?? null,
        },
      }),
      fetchInventoryMeta(playerId),
    ]);

    const updatedDTO = toInventoryItemDTO(
      { ...item, bonusStats: rerolledBonusStats ?? null },
      null,
    );

    res.json({
      logId: log.id,
      turns: turnSpend,
      forge: {
        action: 'reroll',
        success: true,
        itemId: item.id,
        rarity,
        sacrificialItemId: sacrificial.id,
        bonusStats: rerolledBonusStats ?? null,
      },
      tax: taxInfoFromResult(taxResult),
      stateUpdates: {
        inventoryRemoved: [sacrificial.id],
        inventoryUpdated: [updatedDTO],
        inventoryUsedSlots: inventoryMeta.inventoryUsedSlots,
      },
    });
}));
