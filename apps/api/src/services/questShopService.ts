import { prisma } from '@pocketrealm/database';
import {
  GUILD_CONTRACT_DEFINITIONS,
  GUILD_CONTRACT_CONSTANTS,
  getAllMobPrefixes,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { getWeekStart, getLevelBracket } from '../utils/dateHelpers';
import { randomIntInclusive } from '../utils/random';

import type { ShopItemData } from '@pocketrealm/shared';

interface PurchaseParams {
  targetZoneId?: string;
  targetMobTemplateId?: string;
  targetContractId?: string;
}

export async function getShopItems(playerId: string) {
  const db = prisma as any;
  const [items, questState] = await Promise.all([
    db.shopItem.findMany({ where: { enabled: true }, orderBy: { sortOrder: 'asc' } }),
    db.playerQuestState.findUnique({ where: { playerId } }),
  ]);

  const questTokens = questState?.questTokens ?? 0;
  const weekStart = getWeekStart(new Date());

  const purchases: any[] = await db.playerShopPurchase.findMany({
    where: { playerId },
    select: { shopItemId: true, purchasedAt: true },
  });

  // Count purchases per item
  const weeklyCountMap = new Map<string, number>();
  const allTimeCountMap = new Map<string, number>();
  for (const p of purchases) {
    allTimeCountMap.set(p.shopItemId, (allTimeCountMap.get(p.shopItemId) ?? 0) + 1);
    if (p.purchasedAt >= weekStart) {
      weeklyCountMap.set(p.shopItemId, (weeklyCountMap.get(p.shopItemId) ?? 0) + 1);
    }
  }

  // Check active buffs
  const activeBuffs: any[] = await db.playerBuff.findMany({
    where: { playerId },
    select: { buffType: true },
  });
  const activeBuffTypes = new Set(activeBuffs.map((b: any) => b.buffType));

  const mapped: ShopItemData[] = items.map((item: any) => {
    const purchasedThisWeek = weeklyCountMap.get(item.id) ?? 0;
    const purchasedAllTime = allTimeCountMap.get(item.id) ?? 0;
    const hasBuff = item.buffType ? activeBuffTypes.has(item.buffType) : false;

    const withinWeekly = item.weeklyLimit == null || purchasedThisWeek < item.weeklyLimit;
    const withinLifetime = item.lifetimeLimit == null || purchasedAllTime < item.lifetimeLimit;
    const noBuffStacking = !hasBuff;
    const canAfford = questTokens >= item.cost;

    return {
      id: item.id,
      key: item.key,
      name: item.name,
      description: item.description,
      cost: item.cost,
      category: item.category,
      weeklyLimit: item.weeklyLimit,
      lifetimeLimit: item.lifetimeLimit,
      buffType: item.buffType,
      buffValue: item.buffValue,
      buffUses: item.buffUses,
      enabled: true,
      sortOrder: item.sortOrder,
      purchasesThisWeek: purchasedThisWeek,
      purchasesLifetime: purchasedAllTime,
      canPurchase: canAfford && withinWeekly && withinLifetime && noBuffStacking,
    };
  });

  return { items: mapped, questTokens };
}

export async function purchaseItem(playerId: string, shopItemId: string, params?: PurchaseParams) {
  const db = prisma as any;

  const item = await db.shopItem.findUnique({ where: { id: shopItemId } });
  if (!item || !item.enabled) {
    throw new AppError(404, 'Shop item not found', 'SHOP_ITEM_NOT_FOUND');
  }

  const result = await db.$transaction(async (tx: any) => {
    // Check token balance (TOCTOU safe inside tx)
    const questState = await tx.playerQuestState.findUnique({ where: { playerId } });
    if (!questState || questState.questTokens < item.cost) {
      throw new AppError(400, 'Not enough quest tokens', 'INSUFFICIENT_TOKENS');
    }

    const now = new Date();
    const weekStart = getWeekStart(now);

    // Check weekly limit
    if (item.weeklyLimit != null) {
      const weeklyCount = await tx.playerShopPurchase.count({
        where: { playerId, shopItemId, purchasedAt: { gte: weekStart } },
      });
      if (weeklyCount >= item.weeklyLimit) {
        throw new AppError(400, 'Weekly purchase limit reached', 'WEEKLY_LIMIT_REACHED');
      }
    }

    // Check lifetime limit
    if (item.lifetimeLimit != null) {
      const lifetimeCount = await tx.playerShopPurchase.count({
        where: { playerId, shopItemId },
      });
      if (lifetimeCount >= item.lifetimeLimit) {
        throw new AppError(400, 'Lifetime purchase limit reached', 'LIFETIME_LIMIT_REACHED');
      }
    }

    // Check buff stacking
    if (item.buffType) {
      const existingBuff = await tx.playerBuff.findUnique({
        where: { playerId_buffType: { playerId, buffType: item.buffType } },
      });
      if (existingBuff) {
        throw new AppError(400, 'Buff already active', 'BUFF_ALREADY_ACTIVE');
      }
    }

    // Deduct tokens
    const updatedState = await tx.playerQuestState.update({
      where: { playerId },
      data: { questTokens: { decrement: item.cost } },
    });

    // Record purchase
    await tx.playerShopPurchase.create({
      data: { playerId, shopItemId },
    });

    // Apply effect based on item key/category
    const effect = await applyEffect(tx, playerId, item, params);

    return { newBalance: updatedState.questTokens, itemKey: item.key, effect };
  });

  return { success: true, ...result };
}

async function applyEffect(tx: any, playerId: string, item: any, params?: PurchaseParams) {
  switch (item.key) {
    // === Reset category ===
    case 'attribute_reset_scroll':
      return applyAttributeReset(tx, playerId);
    case 'talent_reset_scroll':
      return applyTalentReset(tx, playerId);
    case 'efficiency_reset_scroll':
      return applyEfficiencyReset(tx, playerId);

    // === Utility category ===
    case 'teleport_scroll':
      return applyTeleport(tx, playerId, params?.targetZoneId);
    case 'hearthstone':
      return applyHearthstone(tx, playerId);
    case 'bestiary_tome':
      return applyBestiaryTome(tx, playerId, params?.targetMobTemplateId);
    case 'recipe_scroll':
      return applyRecipeScroll(tx, playerId);
    case 'guild_contract_reroll':
      return applyContractReroll(tx, playerId, params?.targetContractId);

    default:
      // Buff/upgrade items
      if (item.buffType && item.buffValue != null && item.buffUses != null) {
        return applyBuff(tx, playerId, item);
      }
      // Prestige / title items — just the purchase record is enough
      return { type: 'prestige', title: item.name };
  }
}

async function applyBuff(tx: any, playerId: string, item: any) {
  await tx.playerBuff.create({
    data: {
      playerId,
      buffType: item.buffType,
      remainingUses: item.buffUses,
      bonusValue: item.buffValue,
      shopItemId: item.id,
    },
  });
  return { type: 'buff', buffType: item.buffType, uses: item.buffUses, value: item.buffValue };
}

async function applyAttributeReset(tx: any, playerId: string) {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    select: { attributes: true, attributePoints: true },
  });
  if (!player) throw new AppError(404, 'Player not found', 'PLAYER_NOT_FOUND');

  const attrs = player.attributes as Record<string, number>;
  const totalPoints = Object.values(attrs).reduce((sum: number, v: number) => sum + v, 0);

  const resetAttrs: Record<string, number> = {};
  for (const key of Object.keys(attrs)) {
    resetAttrs[key] = 0;
  }

  await tx.player.update({
    where: { id: playerId },
    data: {
      attributes: resetAttrs,
      attributePoints: { increment: totalPoints },
    },
  });

  return { type: 'attribute_reset', refundedPoints: totalPoints };
}

async function applyTalentReset(tx: any, playerId: string) {
  await tx.skillPointAllocation.upsert({
    where: { playerId },
    update: { allocations: {} },
    create: { playerId, allocations: {} },
  });
  return { type: 'talent_reset' };
}

async function applyEfficiencyReset(tx: any, playerId: string) {
  await tx.playerSkill.updateMany({
    where: { playerId },
    data: { dailyXpGained: 0 },
  });
  return { type: 'efficiency_reset' };
}

async function applyTeleport(tx: any, playerId: string, targetZoneId?: string) {
  if (!targetZoneId) {
    throw new AppError(400, 'Target zone required', 'MISSING_TARGET_ZONE');
  }

  const zone = await tx.zone.findUnique({ where: { id: targetZoneId } });
  if (!zone) throw new AppError(404, 'Zone not found', 'ZONE_NOT_FOUND');

  const discovery = await tx.playerZoneDiscovery.findFirst({
    where: { playerId, zoneId: targetZoneId },
  });
  if (!discovery) throw new AppError(400, 'Zone not discovered', 'ZONE_NOT_DISCOVERED');

  await tx.player.update({
    where: { id: playerId },
    data: { currentZoneId: targetZoneId, lastTravelledFromZoneId: targetZoneId },
  });

  return { type: 'teleport', zoneId: targetZoneId, zoneName: zone.name };
}

async function applyHearthstone(tx: any, playerId: string) {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    select: { homeTownId: true },
  });
  if (!player?.homeTownId) {
    throw new AppError(400, 'No home town set', 'NO_HOME_TOWN');
  }

  await tx.player.update({
    where: { id: playerId },
    data: { currentZoneId: player.homeTownId, lastTravelledFromZoneId: player.homeTownId },
  });

  return { type: 'hearthstone', zoneId: player.homeTownId };
}

async function applyBestiaryTome(tx: any, playerId: string, targetMobTemplateId?: string) {
  if (!targetMobTemplateId) {
    throw new AppError(400, 'Target mob template required', 'MISSING_TARGET_MOB');
  }

  const mob = await tx.mobTemplate.findUnique({ where: { id: targetMobTemplateId } });
  if (!mob) throw new AppError(404, 'Mob template not found', 'MOB_NOT_FOUND');

  // Upsert base bestiary entry
  await tx.playerBestiary.upsert({
    where: { playerId_mobTemplateId: { playerId, mobTemplateId: targetMobTemplateId } },
    update: { kills: 999 },
    create: { playerId, mobTemplateId: targetMobTemplateId, kills: 999 },
  });

  // Upsert all prefix variants
  const allPrefixes = getAllMobPrefixes();
  for (const prefix of allPrefixes) {
    await tx.playerBestiaryPrefix.upsert({
      where: {
        playerId_mobTemplateId_prefixKey: {
          playerId,
          mobTemplateId: targetMobTemplateId,
          prefixKey: prefix.key,
        },
      },
      update: { kills: 999 },
      create: {
        playerId,
        mobTemplateId: targetMobTemplateId,
        prefixKey: prefix.key,
        kills: 999,
      },
    });
  }

  return { type: 'bestiary_tome', mobName: mob.name, prefixCount: allPrefixes.length };
}

async function applyRecipeScroll(tx: any, playerId: string) {
  const [allRecipes, knownRecipes, skills] = await Promise.all([
    tx.craftingRecipe.findMany(),
    tx.playerRecipe.findMany({ where: { playerId }, select: { recipeId: true } }),
    tx.playerSkill.findMany({ where: { playerId }, select: { skillType: true, level: true } }),
  ]);

  const knownIds = new Set(knownRecipes.map((r: any) => r.recipeId));
  const skillLevels = new Map(skills.map((s: any) => [s.skillType, s.level]));

  const eligible = allRecipes.filter((r: any) => {
    if (knownIds.has(r.id)) return false;
    const playerLevel = skillLevels.get(r.skillType) ?? 0;
    return playerLevel >= (r.requiredLevel ?? 0);
  });

  if (eligible.length === 0) {
    throw new AppError(400, 'No eligible recipes to learn', 'NO_ELIGIBLE_RECIPES');
  }

  const chosen = eligible[randomIntInclusive(0, eligible.length - 1)];
  await tx.playerRecipe.create({ data: { playerId, recipeId: chosen.id } });

  return { type: 'recipe_scroll', recipeName: chosen.name };
}

async function applyContractReroll(tx: any, playerId: string, targetContractId?: string) {
  if (!targetContractId) {
    throw new AppError(400, 'Target contract required', 'MISSING_TARGET_CONTRACT');
  }

  // Verify player is in a guild with leader/officer role
  const membership = await tx.guildMember.findFirst({
    where: { playerId, role: { in: ['leader', 'officer'] } },
  });
  if (!membership) {
    throw new AppError(403, 'Must be guild leader or officer', 'INSUFFICIENT_GUILD_ROLE');
  }

  // Find the target contract
  const contract = await tx.guildContract.findUnique({ where: { id: targetContractId } });
  if (!contract || contract.guildId !== membership.guildId || contract.status !== 'active') {
    throw new AppError(400, 'Invalid contract', 'INVALID_CONTRACT');
  }

  // Get all active contracts to exclude their keys
  const activeContracts: any[] = await tx.guildContract.findMany({
    where: { guildId: membership.guildId, status: 'active' },
    select: { contractKey: true },
  });
  const usedKeys = new Set(activeContracts.map((c: any) => c.contractKey));

  // Pick a random new definition excluding used keys
  const availableDefs = GUILD_CONTRACT_DEFINITIONS.filter((d) => !usedKeys.has(d.key));
  if (availableDefs.length === 0) {
    throw new AppError(400, 'No alternative contracts available', 'NO_CONTRACTS_AVAILABLE');
  }

  const newDef = availableDefs[randomIntInclusive(0, availableDefs.length - 1)];

  // Determine target value based on guild level bracket
  const guild = await tx.guild.findUnique({
    where: { id: membership.guildId },
    select: { level: true },
  });
  const bracket = getLevelBracket(guild?.level ?? 1);
  const targetValue = newDef.targets[bracket];

  const rewardGuildXp = randomIntInclusive(
    GUILD_CONTRACT_CONSTANTS.REWARD_GUILD_XP_MIN,
    GUILD_CONTRACT_CONSTANTS.REWARD_GUILD_XP_MAX,
  );
  const rewardTreasuryTurns = randomIntInclusive(
    GUILD_CONTRACT_CONSTANTS.REWARD_TREASURY_MIN,
    GUILD_CONTRACT_CONSTANTS.REWARD_TREASURY_MAX,
  );

  // Delete old contract, create new one with same timing
  await tx.guildContract.delete({ where: { id: targetContractId } });
  await tx.guildContract.create({
    data: {
      guildId: membership.guildId,
      contractKey: newDef.key,
      targetValue,
      weekStartedAt: contract.weekStartedAt,
      expiresAt: contract.expiresAt,
      rewardGuildXp,
      rewardTreasuryTurns,
    },
  });

  // Log the reroll
  await tx.guildLog.create({
    data: {
      guildId: membership.guildId,
      action: 'contract_rerolled',
      details: `Contract rerolled from ${contract.contractKey} to ${newDef.key}`,
      actorId: playerId,
    },
  });

  return { type: 'contract_reroll', oldKey: contract.contractKey, newKey: newDef.key };
}
