import { Router } from 'express';
import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import {
  ALL_SKILLS,
  CRAFTING_CONSTANTS,
  type CraftingMaterial,
  type EquipmentSlot,
  type ItemRarity,
  type ItemStats,
  type ItemType,
  type SkillType,
} from '@adventure/shared';
import {
  calculateCraftingCrit,
  calculateForgeUpgradeSuccessChance,
  getEligibleBonusStats,
  getForgeRerollCost,
  getForgeUpgradeCost,
  getNextRarity,
  rollBonusStat,
  rollBonusStatsForRarity,
} from '@adventure/game-engine';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { getEquipmentStats } from '../services/equipmentService';
import { spendPlayerTurnsTx } from '../services/turnBankService';
import { incrementStats } from '../services/statsService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';
import {
  addStackableItemTx,
  consumeItemsByTemplateTx,
  getTotalQuantityByTemplate,
} from '../services/inventoryService';
import { grantSkillXp } from '../services/xpService';
import { getHpState } from '../services/hpService';
import { addGuildXp, getPlayerGuildId } from '../services/guildService';
import { applyGuildTaxTx } from '../services/guildTaxService';
import { getPlayerGuildModifiers } from '../services/guildUpgradeService';
import { incrementContractProgress } from '../services/guildContractService';
import { GUILD_CONSTANTS } from '@adventure/shared';

export const craftingRouter = Router();

craftingRouter.use(authenticate);
const prismaAny = prisma as unknown as any;

function isSkillType(value: string): value is SkillType {
  return ALL_SKILLS.includes(value as SkillType);
}

function isItemType(value: string): value is ItemType {
  return value === 'weapon' || value === 'armor' || value === 'resource' || value === 'consumable';
}

async function getSkillLevel(playerId: string, skillType: SkillType): Promise<number> {
  const skill = await prisma.playerSkill.findUnique({
    where: { playerId_skillType: { playerId, skillType } },
    select: { level: true },
  });

  return skill?.level ?? 1;
}

async function getZoneCraftingLevel(playerId: string): Promise<{ maxCraftingLevel: number | null; zoneName: string }> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { currentZoneId: true },
  });
  if (!player?.currentZoneId) {
    throw new AppError(400, 'You must be in a zone to craft', 'NO_ZONE');
  }
  const zone = await prisma.zone.findUnique({
    where: { id: player.currentZoneId },
    select: { name: true, maxCraftingLevel: true },
  });
  if (!zone) {
    throw new AppError(400, 'Current zone not found', 'NO_ZONE');
  }
  return { maxCraftingLevel: zone.maxCraftingLevel, zoneName: zone.name };
}

function assertZoneAllowsCrafting(zone: { maxCraftingLevel: number | null; zoneName: string }): void {
  if (zone.maxCraftingLevel === 0) {
    throw new AppError(400, 'No crafting facilities available here. Travel to a town to craft.', 'NO_CRAFTING_FACILITY');
  }
}

function assertZoneAllowsRecipeLevel(zone: { maxCraftingLevel: number | null; zoneName: string }, requiredLevel: number): void {
  if (zone.maxCraftingLevel !== null && requiredLevel > zone.maxCraftingLevel) {
    throw new AppError(
      400,
      `${zone.zoneName}'s forge can only craft up to level ${zone.maxCraftingLevel} recipes. This recipe requires level ${requiredLevel}.`,
      'FORGE_LEVEL_TOO_LOW',
    );
  }
}

function parseMaterials(value: unknown): CraftingMaterial[] {
  const materialSchema = z.object({
    templateId: z.string().uuid(),
    quantity: z.number().int().positive(),
  });

  const arraySchema = z.array(materialSchema);
  return arraySchema.parse(value);
}

function toSingularFamilyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.endsWith('ies')) return `${trimmed.slice(0, -3)}y`;
  if (trimmed.endsWith('s') && !trimmed.endsWith('ss')) return trimmed.slice(0, -1);
  return trimmed;
}

function buildRecipeDiscoveryHint(mobFamily: { name: string; siteNounLarge: string } | null | undefined): string {
  if (!mobFamily) return 'A unique drop from a large encounter site.';
  const familyName = toSingularFamilyName(mobFamily.name).toLowerCase();
  const siteNoun = mobFamily.siteNounLarge.toLowerCase();
  return `A unique drop from a large ${familyName} ${siteNoun}!`;
}

function isItemRarity(value: string): value is ItemRarity {
  return value === 'common' || value === 'uncommon' || value === 'rare' || value === 'epic' || value === 'legendary';
}

function parseItemRarity(value: string): ItemRarity {
  if (isItemRarity(value)) return value;
  throw new AppError(400, 'Invalid item rarity value', 'INVALID_ITEM');
}

function normalizeBonusStats(value: unknown): ItemStats {
  const out: ItemStats = {};
  if (!value || typeof value !== 'object') return out;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw === 0) continue;
    (out as Record<string, number>)[key] = raw;
  }

  return out;
}

interface SacrificialItemMatch {
  id: string;
  templateId: string;
  rarity: string;
}

async function getValidatedSacrificialItem(params: {
  playerId: string;
  targetItemId: string;
  sacrificialItemId: string;
  rarity: ItemRarity;
  itemType?: string;
  templateId?: string;
  action: 'upgrade' | 'reroll';
}): Promise<SacrificialItemMatch> {
  if (params.sacrificialItemId === params.targetItemId) {
    throw new AppError(400, 'Sacrificial item must be different from target item', 'FORGE_INVALID_SACRIFICE');
  }

  const sacrificial = await (prisma as any).item.findUnique({
    where: { id: params.sacrificialItemId },
    include: { template: true },
  });
  if (!sacrificial || sacrificial.ownerId !== params.playerId) {
    throw new AppError(404, 'Sacrificial item not found', 'NOT_FOUND');
  }

  if (sacrificial.quantity !== 1) {
    throw new AppError(400, 'Cannot use stacked items as sacrifice', 'INVALID_STACK');
  }

  const equipped = await prisma.playerEquipment.findFirst({
    where: { playerId: params.playerId, itemId: sacrificial.id },
    select: { slot: true },
  });
  if (equipped) {
    throw new AppError(400, 'Cannot use an equipped item as sacrifice', 'ITEM_EQUIPPED');
  }

  const sacrificialRarity = parseItemRarity(sacrificial.rarity);
  if (sacrificialRarity !== params.rarity) {
    throw new AppError(
      400,
      `Sacrificial item must be ${params.rarity} rarity for ${params.action}`,
      'FORGE_INVALID_SACRIFICE'
    );
  }

  if (params.itemType && sacrificial.template.itemType !== params.itemType) {
    throw new AppError(
      400,
      `Sacrificial item must be the same item type (${params.itemType})`,
      'FORGE_INVALID_SACRIFICE'
    );
  }

  if (params.templateId && sacrificial.templateId !== params.templateId) {
    throw new AppError(400, 'Sacrificial item must be the same item template', 'FORGE_INVALID_SACRIFICE');
  }

  return {
    id: sacrificial.id,
    templateId: sacrificial.templateId,
    rarity: sacrificial.rarity,
  };
}

function calculateSalvageMaterials(materials: CraftingMaterial[]): CraftingMaterial[] {
  const refunded = materials.map((material) => ({
    templateId: material.templateId,
    quantity: Math.floor(material.quantity * CRAFTING_CONSTANTS.SALVAGE_BASE_REFUND_RATE),
  }));

  if (refunded.length > 0 && refunded.every((material) => material.quantity <= 0)) {
    let richestIndex = 0;
    for (let i = 1; i < materials.length; i++) {
      if (materials[i]!.quantity > materials[richestIndex]!.quantity) richestIndex = i;
    }
    refunded[richestIndex] = {
      templateId: materials[richestIndex]!.templateId,
      quantity: CRAFTING_CONSTANTS.SALVAGE_MIN_PRIMARY_RETURN,
    };
  }

  return refunded.filter((material) => material.quantity > 0);
}

/**
 * GET /api/v1/crafting/recipes
 * List recipes visible to the player (based on skill level).
 */
craftingRouter.get('/recipes', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;

    const [skills, learnedAdvancedRecipes] = await Promise.all([
      prisma.playerSkill.findMany({
        where: { playerId },
        select: { skillType: true, level: true },
      }),
      prismaAny.playerRecipe.findMany({
        where: { playerId },
        select: { recipeId: true },
      }) as Promise<Array<{ recipeId: string }>>,
    ]);

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { currentZoneId: true },
    });
    const currentZone = player?.currentZoneId
      ? await prisma.zone.findUnique({
          where: { id: player.currentZoneId },
          select: { name: true, maxCraftingLevel: true },
        })
      : null;

    const skillLevels = new Map<string, number>(skills.map((s: typeof skills[number]) => [s.skillType, s.level]));
    const learnedRecipeIds = new Set(learnedAdvancedRecipes.map((entry) => entry.recipeId));

    const recipes = await prismaAny.craftingRecipe.findMany({
      include: {
        resultTemplate: true,
        mobFamily: {
          select: {
            name: true,
            siteNounLarge: true,
          },
        },
      },
      orderBy: [{ requiredLevel: 'asc' }],
    }) as Array<{
      id: string;
      skillType: string;
      requiredLevel: number;
      resultTemplate: any;
      mobFamily?: {
        name: string;
        siteNounLarge: string;
      } | null;
      isAdvanced?: boolean;
      soulbound?: boolean;
      mobFamilyId?: string | null;
      turnCost: number;
      materials: unknown;
      xpReward: number;
    }>;

    const visible = recipes
      .map((r: typeof recipes[number]) => {
        const isAdvanced = Boolean(r.isAdvanced);
        const isDiscovered = !isAdvanced || learnedRecipeIds.has(r.id);

        return {
          id: r.id,
          skillType: r.skillType,
          requiredLevel: r.requiredLevel,
          resultTemplate: r.resultTemplate,
          isAdvanced,
          isDiscovered,
          discoveryHint: isDiscovered ? null : buildRecipeDiscoveryHint(r.mobFamily),
          soulbound: Boolean(r.soulbound),
          mobFamilyId: r.mobFamilyId ?? null,
          turnCost: r.turnCost,
          materials: parseMaterials(r.materials),
          materialTemplates: [] as Array<{ id: string; name: string; itemType: string; stackable: boolean }>,
          xpReward: r.xpReward,
        };
      });

    // Attach material template metadata for UI convenience
    const allMaterialIds = new Set<string>();
    for (const r of visible) {
      for (const m of r.materials) allMaterialIds.add(m.templateId);
    }

    const templates = await prisma.itemTemplate.findMany({
      where: { id: { in: Array.from(allMaterialIds) } },
      select: { id: true, name: true, itemType: true, stackable: true },
    });
    const byId = new Map(templates.map((t: typeof templates[number]) => [t.id, t]));

    for (const r of visible) {
      r.materialTemplates = r.materials
        .map((m: CraftingMaterial) => byId.get(m.templateId))
        .filter(Boolean) as Array<{ id: string; name: string; itemType: string; stackable: boolean }>;
    }

    res.json({
      recipes: visible,
      zoneCraftingLevel: currentZone ? currentZone.maxCraftingLevel : 0,
      zoneName: currentZone?.name ?? null,
    });
  } catch (err) {
    next(err);
  }
});

const craftSchema = z.object({
  recipeId: z.string().uuid(),
  quantity: z.number().int().positive().default(1),
});

const salvageSchema = z.object({
  itemId: z.string().uuid(),
});

const forgeUpgradeSchema = z.object({
  itemId: z.string().uuid(),
  sacrificialItemId: z.string().uuid(),
});

const forgeRerollSchema = z.object({
  itemId: z.string().uuid(),
  sacrificialItemId: z.string().uuid(),
});

/**
 * POST /api/v1/crafting/craft
 * Validate materials, spend turns, craft item, and grant XP.
 */
craftingRouter.post('/craft', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = craftSchema.parse(req.body);

    // Check if player is recovering
    const hpState = await getHpState(playerId);
    if (hpState.isRecovering) {
      throw new AppError(400, 'Cannot craft while recovering', 'IS_RECOVERING');
    }

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

    const totalTurnCost = recipe.turnCost * quantity;
    const turnSpend = await prisma.$transaction(async (tx) => {
      const spent = await spendPlayerTurnsTx(tx, playerId, totalTurnCost);
      await applyGuildTaxTx(tx, playerId, totalTurnCost);

      for (const mat of materials) {
        await consumeItemsByTemplateTx(tx, playerId, mat.templateId, mat.quantity * quantity);
      }

      return spent;
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
        where: { ownerId: playerId, templateId: recipe.resultTemplateId },
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
      const templateBaseStats = recipe.resultTemplate.baseStats as ItemStats | null | undefined;

      // Add guild crafting crit bonus as equivalent virtual luck
      const effectiveLuck = guildMods.craftingCrit > 0
        ? equipStats.luck + Math.floor(guildMods.craftingCrit / CRAFTING_CONSTANTS.LUCK_CRIT_BONUS_PER_POINT)
        : equipStats.luck;

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

    // Guild XP + contract progress for crafting
    const guildId = await getPlayerGuildId(playerId);
    if (guildId) {
      await addGuildXp(guildId, GUILD_CONSTANTS.XP_PER_CRAFT * quantity);
      void incrementContractProgress(guildId, 'craft_items', quantity);
      // Count rare+ items for craft_rare contract
      const rareCount = craftedItemDetails.filter(
        (d) => d.rarity === 'rare' || d.rarity === 'epic' || d.rarity === 'legendary',
      ).length;
      if (rareCount > 0) void incrementContractProgress(guildId, 'craft_rare', rareCount);
    }

    // --- Achievement tracking (counters + derived checks) ---
    const isRealCraft = recipe.resultTemplate.itemType !== 'resource';
    const craftCounters: Record<string, number> = { totalTurnsSpent: totalTurnCost };
    if (isRealCraft) {
      craftCounters.totalCrafts = quantity;
      for (const item of craftedItemDetails) {
        if (item.rarity === 'rare') craftCounters.totalRaresCrafted = (craftCounters.totalRaresCrafted ?? 0) + 1;
        if (item.rarity === 'epic') craftCounters.totalEpicsCrafted = (craftCounters.totalEpicsCrafted ?? 0) + 1;
        if (item.rarity === 'legendary') craftCounters.totalLegendariesCrafted = (craftCounters.totalLegendariesCrafted ?? 0) + 1;
      }
    }
    await incrementStats(playerId, craftCounters);

    const craftAchKeys: string[] = [];
    if (isRealCraft) craftAchKeys.push('totalCrafts');
    if (craftCounters.totalRaresCrafted) craftAchKeys.push('totalRaresCrafted');
    if (craftCounters.totalEpicsCrafted) craftAchKeys.push('totalEpicsCrafted');
    if (craftCounters.totalLegendariesCrafted) craftAchKeys.push('totalLegendariesCrafted');
    if (xpGrant.newLevel) craftAchKeys.push('highestSkillLevel');
    if (xpGrant.characterLevelAfter && xpGrant.characterLevelAfter > (xpGrant.characterLevelBefore ?? 0)) craftAchKeys.push('highestCharacterLevel');
    const craftAchievements = await checkAchievements(playerId, { statKeys: craftAchKeys });
    await emitAchievementNotifications(playerId, craftAchievements);

    const log = await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'crafting',
        turnsSpent: totalTurnCost,
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
          xp: {
            skillType: xpGrant.skillType,
            ...xpGrant.xpResult,
            newTotalXp: xpGrant.newTotalXp,
            newDailyXpGained: xpGrant.newDailyXpGained,
            characterXpGain: xpGrant.characterXpGain,
            characterXpAfter: xpGrant.characterXpAfter,
            characterLevelBefore: xpGrant.characterLevelBefore,
            characterLevelAfter: xpGrant.characterLevelAfter,
            attributePointsAfter: xpGrant.attributePointsAfter,
            characterLeveledUp: xpGrant.characterLeveledUp,
          },
        } as unknown as Prisma.InputJsonValue,
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
      xp: {
        skillType: xpGrant.skillType,
        ...xpGrant.xpResult,
        newTotalXp: xpGrant.newTotalXp,
        newDailyXpGained: xpGrant.newDailyXpGained,
        characterXpGain: xpGrant.characterXpGain,
        characterXpAfter: xpGrant.characterXpAfter,
        characterLevelBefore: xpGrant.characterLevelBefore,
        characterLevelAfter: xpGrant.characterLevelAfter,
        attributePointsAfter: xpGrant.attributePointsAfter,
        characterLeveledUp: xpGrant.characterLeveledUp,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/crafting/forge/upgrade
 * Attempt to upgrade item rarity by one tier. Failure destroys the item.
 */
craftingRouter.post('/forge/upgrade', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = forgeUpgradeSchema.parse(req.body);

    const hpState = await getHpState(playerId);
    if (hpState.isRecovering) {
      throw new AppError(400, 'Cannot use forge while recovering', 'IS_RECOVERING');
    }

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const item = await (prisma as any).item.findUnique({
      where: { id: body.itemId },
      include: { template: true },
    });

    if (!item || item.ownerId !== playerId) {
      throw new AppError(404, 'Item not found', 'NOT_FOUND');
    }

    if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
      throw new AppError(400, 'Only weapons/armor can be upgraded', 'INVALID_ITEM_TYPE');
    }

    if (item.quantity !== 1) {
      throw new AppError(400, 'Cannot upgrade stacked items', 'INVALID_STACK');
    }

    const equipped = await prisma.playerEquipment.findFirst({
      where: { playerId, itemId: item.id },
      select: { slot: true },
    });
    if (equipped) {
      throw new AppError(400, 'Cannot upgrade an equipped item', 'ITEM_EQUIPPED');
    }

    const currentRarity = parseItemRarity(item.rarity);
    const nextRarity = getNextRarity(currentRarity);
    const upgradeCost = getForgeUpgradeCost(currentRarity);
    if (!nextRarity || upgradeCost === null) {
      throw new AppError(400, 'Legendary items cannot be upgraded', 'MAX_RARITY');
    }

    const sacrificial = await getValidatedSacrificialItem({
      playerId,
      targetItemId: item.id,
      sacrificialItemId: body.sacrificialItemId,
      rarity: currentRarity,
      itemType: item.template.itemType,
      action: 'upgrade',
    });

    const turnSpend = await prisma.$transaction(async (tx) => {
      const spent = await spendPlayerTurnsTx(tx, playerId, upgradeCost);
      await applyGuildTaxTx(tx, playerId, upgradeCost);
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
      return spent;
    });
    const equipmentStats = await getEquipmentStats(playerId);
    const successChance = calculateForgeUpgradeSuccessChance(currentRarity, equipmentStats.luck);
    if (successChance === null) {
      throw new AppError(400, 'Legendary items cannot be upgraded', 'MAX_RARITY');
    }
    const roll = Math.random();
    const success = roll < successChance;

    // --- Achievement stat tracking ---
    await incrementStats(playerId, { totalForgeUpgrades: 1 });
    const forgeAchievements = await checkAchievements(playerId, { statKeys: ['totalForgeUpgrades'] });
    await emitAchievementNotifications(playerId, forgeAchievements);

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
        } as any,
      });

      const log = await prisma.activityLog.create({
        data: {
          playerId,
          activityType: 'forge_upgrade',
          turnsSpent: upgradeCost,
          result: {
            itemId: item.id,
            templateId: item.templateId,
            fromRarity: currentRarity,
            toRarity: nextRarity,
            success: true,
            successChance,
            roll,
            luckStat: equipmentStats.luck,
            sacrificialItem: {
              itemId: sacrificial.id,
              templateId: sacrificial.templateId,
              rarity: sacrificial.rarity,
            },
            previousBonusStats: item.bonusStats ?? null,
            addedBonusStat: newRoll.stat,
            addedBonusValue: newRoll.value,
            bonusStats: upgradedBonusStats,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      res.json({
        logId: log.id,
        turns: turnSpend,
        forge: {
          action: 'upgrade',
          success: true,
          destroyed: false,
          itemId: item.id,
          fromRarity: currentRarity,
          toRarity: nextRarity,
          successChance,
          roll,
          sacrificialItemId: sacrificial.id,
          addedBonusStat: newRoll.stat,
          addedBonusValue: newRoll.value,
          bonusStats: upgradedBonusStats,
        },
      });
      return;
    }

    const destroyedItemSnapshot = {
      itemId: item.id,
      templateId: item.templateId,
      rarity: currentRarity,
      bonusStats: item.bonusStats ?? null,
      currentDurability: item.currentDurability,
      maxDurability: item.maxDurability,
    };
    await prisma.item.delete({ where: { id: item.id } });

    const log = await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'forge_upgrade',
        turnsSpent: upgradeCost,
        result: {
          itemId: item.id,
          templateId: item.templateId,
          fromRarity: currentRarity,
          toRarity: nextRarity,
          success: false,
          successChance,
          roll,
          luckStat: equipmentStats.luck,
          sacrificialItem: {
            itemId: sacrificial.id,
            templateId: sacrificial.templateId,
            rarity: sacrificial.rarity,
          },
          outcome: 'destroyed',
          destroyedItem: destroyedItemSnapshot,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    res.json({
      logId: log.id,
      turns: turnSpend,
      forge: {
        action: 'upgrade',
        success: false,
        destroyed: true,
        itemId: item.id,
        fromRarity: currentRarity,
        toRarity: nextRarity,
        successChance,
        roll,
        sacrificialItemId: sacrificial.id,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/crafting/forge/reroll
 * Re-roll all bonus stats for an Uncommon+ unequipped weapon/armor item.
 */
craftingRouter.post('/forge/reroll', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = forgeRerollSchema.parse(req.body);

    const hpState = await getHpState(playerId);
    if (hpState.isRecovering) {
      throw new AppError(400, 'Cannot use forge while recovering', 'IS_RECOVERING');
    }

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const item = await (prisma as any).item.findUnique({
      where: { id: body.itemId },
      include: { template: true },
    });
    if (!item || item.ownerId !== playerId) {
      throw new AppError(404, 'Item not found', 'NOT_FOUND');
    }

    if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
      throw new AppError(400, 'Only weapons/armor can be rerolled', 'INVALID_ITEM_TYPE');
    }

    if (item.quantity !== 1) {
      throw new AppError(400, 'Cannot reroll stacked items', 'INVALID_STACK');
    }

    const equipped = await prisma.playerEquipment.findFirst({
      where: { playerId, itemId: item.id },
      select: { slot: true },
    });
    if (equipped) {
      throw new AppError(400, 'Cannot reroll an equipped item', 'ITEM_EQUIPPED');
    }

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

    const turnSpend = await prisma.$transaction(async (tx) => {
      const spent = await spendPlayerTurnsTx(tx, playerId, rerollCost);
      await applyGuildTaxTx(tx, playerId, rerollCost);
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
      return spent;
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

    const log = await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'forge_reroll',
        turnsSpent: rerollCost,
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
        } as unknown as Prisma.InputJsonValue,
      },
    });

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
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/crafting/salvage
 * Salvage one crafted weapon/armor for a partial material refund.
 */
craftingRouter.post('/salvage', async (req, res, next) => {
  try {
    const playerId = req.player!.playerId;
    const body = salvageSchema.parse(req.body);

    const zone = await getZoneCraftingLevel(playerId);
    assertZoneAllowsCrafting(zone);

    const item = await prisma.item.findUnique({
      where: { id: body.itemId },
      include: { template: true },
    });

    if (!item || item.ownerId !== playerId) {
      throw new AppError(404, 'Item not found', 'NOT_FOUND');
    }

    if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
      throw new AppError(400, 'Only weapons/armor can be salvaged', 'INVALID_ITEM_TYPE');
    }

    if (item.quantity !== 1) {
      throw new AppError(400, 'Cannot salvage stacked items', 'INVALID_STACK');
    }

    const equipped = await prisma.playerEquipment.findFirst({
      where: { playerId, itemId: item.id },
      select: { slot: true },
    });

    if (equipped) {
      throw new AppError(400, 'Cannot salvage an equipped item', 'ITEM_EQUIPPED');
    }

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

    const { turnSpend, returned } = await prisma.$transaction(async (tx) => {
      const spent = await spendPlayerTurnsTx(tx, playerId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);
      await applyGuildTaxTx(tx, playerId, CRAFTING_CONSTANTS.SALVAGE_TURN_COST);

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

      return { turnSpend: spent, returned: minted };
    });

    // --- Achievement stat tracking ---
    await incrementStats(playerId, { totalSalvages: 1 });
    const salvageAchievements = await checkAchievements(playerId, { statKeys: ['totalSalvages'] });
    await emitAchievementNotifications(playerId, salvageAchievements);

    const log = await prisma.activityLog.create({
      data: {
        playerId,
        activityType: 'salvage',
        turnsSpent: CRAFTING_CONSTANTS.SALVAGE_TURN_COST,
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
    });
  } catch (err) {
    next(err);
  }
});
