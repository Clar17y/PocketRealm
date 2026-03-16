import { Prisma } from '@pocketrealm/database';
import { HIDDEN_CACHE_CONSTANTS, GEM_CONSTANTS, levelToGemTier } from '@pocketrealm/shared';
import { randomIntInclusive } from '../utils/random';
import { addStackableItemTx } from './inventoryService';
import type { PendingLootItem } from './pendingLootService';

export interface CacheMaterialDrop {
  itemTemplateId: string;
  name: string;
  quantity: number;
}

export interface CacheLootResult {
  materials: CacheMaterialDrop[];
  soulboundItem: { itemTemplateId: string; name: string; rarity: string } | null;
  overflow: PendingLootItem[];
  slotsConsumed: number;
}

export function rollRarityWithLuck(luck: number): 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' {
  const { RARITY_WEIGHTS, LUCK_RARITY_SCALING } = HIDDEN_CACHE_CONSTANTS;
  // Luck shifts weight from common toward higher rarities
  const luckBonus = luck * LUCK_RARITY_SCALING;
  const commonWeight = Math.max(5, RARITY_WEIGHTS.common - luckBonus * 100);
  const uncommonWeight = RARITY_WEIGHTS.uncommon + luckBonus * 30;
  const rareWeight = RARITY_WEIGHTS.rare + luckBonus * 40;
  const epicWeight = RARITY_WEIGHTS.epic + luckBonus * 30;
  const legendaryWeight = RARITY_WEIGHTS.legendary;

  const total = commonWeight + uncommonWeight + rareWeight + epicWeight + legendaryWeight;
  const roll = Math.random() * total;

  if (roll < commonWeight) return 'common';
  if (roll < commonWeight + uncommonWeight) return 'uncommon';
  if (roll < commonWeight + uncommonWeight + rareWeight) return 'rare';
  if (roll < commonWeight + uncommonWeight + rareWeight + epicWeight) return 'epic';
  return 'legendary';
}

type SoulboundRecipe = {
  resultTemplateId: string;
  resultTemplate: { name: string; itemType: string; stackable: boolean; maxDurability: number };
};

/** Pick a random soulbound recipe, roll rarity, grant (or overflow) the item. */
async function grantSoulboundFromRecipes(
  tx: Prisma.TransactionClient,
  recipes: SoulboundRecipe[],
  playerId: string,
  luck: number,
  remainingSlots: number,
  overflow: PendingLootItem[],
): Promise<{ soulboundItem: CacheLootResult['soulboundItem']; slotsUsed: number }> {
  const picked = recipes[randomIntInclusive(0, recipes.length - 1)]!;
  const rarity = rollRarityWithLuck(luck);
  const isEquipment = picked.resultTemplate.itemType === 'weapon' || picked.resultTemplate.itemType === 'armor';
  const maxDurability = isEquipment ? picked.resultTemplate.maxDurability : null;

  if (remainingSlots > 0) {
    await tx.item.create({
      data: {
        ownerId: playerId,
        templateId: picked.resultTemplateId,
        rarity,
        quantity: 1,
        maxDurability,
        currentDurability: maxDurability,
      },
    });
    return {
      soulboundItem: { itemTemplateId: picked.resultTemplateId, name: picked.resultTemplate.name, rarity },
      slotsUsed: 1,
    };
  }

  overflow.push({
    templateId: picked.resultTemplateId,
    templateName: picked.resultTemplate.name,
    rarity,
    quantity: 1,
    bonusStats: null,
    currentDurability: maxDurability,
    maxDurability,
  });
  return {
    soulboundItem: { itemTemplateId: picked.resultTemplateId, name: picked.resultTemplate.name, rarity },
    slotsUsed: 0,
  };
}

export async function grantCacheLootTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    zoneId: string;
    mobFamilyId: string;
    luck: number;
    availableSlots?: number;
  }
): Promise<CacheLootResult> {
  const { MATERIAL_ROLLS_MIN, MATERIAL_ROLLS_MAX, SOULBOUND_DROP_CHANCE } = HIDDEN_CACHE_CONSTANTS;

  // --- Refined gem materials from zone gathering nodes ---
  const resourceNodes = await tx.resourceNode.findMany({
    where: { zoneId: params.zoneId },
    select: { skillRequired: true, levelRequired: true },
  });

  // Determine which raw gems this zone produces
  const rawGemNames: string[] = [];
  for (const node of resourceNodes) {
    const gemTier = levelToGemTier(node.levelRequired);
    const rawGemName = GEM_CONSTANTS.GEM_BY_SKILL_TIER[node.skillRequired]?.[gemTier];
    if (rawGemName) rawGemNames.push(rawGemName);
  }

  const cutGemTemplateIds: Array<{ templateId: string; name: string }> = [];

  if (rawGemNames.length > 0) {
    // Find all raw gem template IDs in one query
    const rawGemTemplates = await tx.itemTemplate.findMany({
      where: { name: { in: rawGemNames }, itemType: 'resource' },
      select: { id: true, name: true },
    });
    const rawGemIdSet = new Set(rawGemTemplates.map(t => t.id));

    // Fetch all refining recipes and filter by raw gem materials in JS
    // (materials is a Json column storing { templateId, quantity } — can't use relational filters)
    const refiningRecipes = await tx.craftingRecipe.findMany({
      where: { skillType: 'refining' },
      select: {
        resultTemplateId: true,
        resultTemplate: { select: { name: true } },
        materials: true,
      },
    });

    for (const recipe of refiningRecipes) {
      const mats = recipe.materials as unknown as Array<{ templateId: string; quantity: number }>;
      const usesZoneGem = mats.some(m => rawGemIdSet.has(m.templateId));
      if (!usesZoneGem) continue;

      cutGemTemplateIds.push({
        templateId: recipe.resultTemplateId,
        name: recipe.resultTemplate.name,
      });
    }
  }

  // Roll 2-4 cut gems from the available pool (random picks with replacement)
  const materials: CacheMaterialDrop[] = [];
  const overflow: PendingLootItem[] = [];
  const initialSlots = params.availableSlots ?? Infinity;
  let remainingSlots = initialSlots;

  // Track which stackable templates already exist in player's backpack
  // (merging into an existing stack doesn't consume a new slot)
  const existingStacks = new Set<string>();
  if (params.availableSlots != null) {
    const playerItems = await tx.item.findMany({
      where: { ownerId: params.playerId, inStash: false },
      select: { templateId: true },
    });
    for (const item of playerItems) existingStacks.add(item.templateId);
  }

  if (cutGemTemplateIds.length > 0) {
    const materialRolls = randomIntInclusive(MATERIAL_ROLLS_MIN, MATERIAL_ROLLS_MAX);
    const materialMap = new Map<string, CacheMaterialDrop>();

    for (let i = 0; i < materialRolls; i++) {
      const picked = cutGemTemplateIds[randomIntInclusive(0, cutGemTemplateIds.length - 1)]!;
      const alreadyGranted = materialMap.has(picked.templateId);
      const hasExistingStack = existingStacks.has(picked.templateId) || alreadyGranted;
      const needsNewSlot = !hasExistingStack;

      if (needsNewSlot && remainingSlots <= 0) {
        // Overflow — add to pending loot instead
        const existing = overflow.find(o => o.templateId === picked.templateId);
        if (existing) {
          existing.quantity += 1;
        } else {
          overflow.push({
            templateId: picked.templateId,
            templateName: picked.name,
            rarity: 'common',
            quantity: 1,
            bonusStats: null,
            currentDurability: null,
            maxDurability: null,
          });
        }
      } else {
        if (needsNewSlot) remainingSlots--;
        await addStackableItemTx(tx, params.playerId, picked.templateId, 1);

        const existing = materialMap.get(picked.templateId);
        if (existing) {
          existing.quantity += 1;
        } else {
          const drop: CacheMaterialDrop = { itemTemplateId: picked.templateId, name: picked.name, quantity: 1 };
          materialMap.set(picked.templateId, drop);
          materials.push(drop);
        }
      }
    }
  }

  // --- Soulbound item roll (uses mob family) ---
  let soulboundItem: CacheLootResult['soulboundItem'] = null;

  const soulboundRecipeSelect = {
    resultTemplateId: true,
    resultTemplate: { select: { name: true, itemType: true, stackable: true, maxDurability: true } },
  } as const;

  if (Math.random() < SOULBOUND_DROP_CHANCE) {
    const soulboundRecipes = await tx.craftingRecipe.findMany({
      where: { soulbound: true, mobFamilyId: params.mobFamilyId },
      select: soulboundRecipeSelect,
    });

    if (soulboundRecipes.length > 0) {
      const grant = await grantSoulboundFromRecipes(tx, soulboundRecipes, params.playerId, params.luck, remainingSlots, overflow);
      soulboundItem = grant.soulboundItem;
      remainingSlots -= grant.slotsUsed;
    }
  }

  // --- Fallback: if cache would be empty, grant a soulbound item from zone mob families ---
  if (materials.length === 0 && soulboundItem === null) {
    const fallbackRecipes = await tx.craftingRecipe.findMany({
      where: {
        soulbound: true,
        mobFamily: { zoneMappings: { some: { zoneId: params.zoneId } } },
      },
      select: soulboundRecipeSelect,
    });

    if (fallbackRecipes.length > 0) {
      const grant = await grantSoulboundFromRecipes(tx, fallbackRecipes, params.playerId, params.luck, remainingSlots, overflow);
      soulboundItem = grant.soulboundItem;
      remainingSlots -= grant.slotsUsed;
    }
  }

  const slotsConsumed = initialSlots === Infinity ? 0 : Math.max(0, initialSlots - remainingSlots);
  return { materials, soulboundItem, overflow, slotsConsumed };
}
