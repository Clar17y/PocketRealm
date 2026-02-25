import { Prisma } from '@adventure/database';
import { HIDDEN_CACHE_CONSTANTS, GEM_CONSTANTS, levelToGemTier } from '@adventure/shared';
import { randomIntInclusive } from '../utils/random';
import { addStackableItemTx } from './inventoryService';

export interface CacheMaterialDrop {
  itemTemplateId: string;
  name: string;
  quantity: number;
}

export interface CacheLootResult {
  materials: CacheMaterialDrop[];
  soulboundItem: { itemTemplateId: string; name: string; rarity: string } | null;
}

export function rollRarityWithLuck(luck: number): 'common' | 'uncommon' | 'rare' | 'epic' {
  const { RARITY_WEIGHTS, LUCK_RARITY_SCALING } = HIDDEN_CACHE_CONSTANTS;
  // Luck shifts weight from common toward higher rarities
  const luckBonus = luck * LUCK_RARITY_SCALING;
  const commonWeight = Math.max(5, RARITY_WEIGHTS.common - luckBonus * 100);
  const uncommonWeight = RARITY_WEIGHTS.uncommon + luckBonus * 30;
  const rareWeight = RARITY_WEIGHTS.rare + luckBonus * 40;
  const epicWeight = RARITY_WEIGHTS.epic + luckBonus * 30;

  const total = commonWeight + uncommonWeight + rareWeight + epicWeight;
  const roll = Math.random() * total;

  if (roll < commonWeight) return 'common';
  if (roll < commonWeight + uncommonWeight) return 'uncommon';
  if (roll < commonWeight + uncommonWeight + rareWeight) return 'rare';
  return 'epic';
}

export async function grantCacheLootTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    zoneId: string;
    mobFamilyId: string; // still needed for soulbound recipes
    luck: number;
  }
): Promise<CacheLootResult> {
  const txAny = tx as unknown as Record<string, unknown>;
  const { MATERIAL_ROLLS_MIN, MATERIAL_ROLLS_MAX, SOULBOUND_DROP_CHANCE } = HIDDEN_CACHE_CONSTANTS;

  // --- Refined gem materials from zone gathering nodes ---
  const resourceNodes = await (txAny as any).resourceNode.findMany({
    where: { zoneId: params.zoneId },
    select: { skillRequired: true, levelRequired: true },
  }) as Array<{ skillRequired: string; levelRequired: number }>;

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
    const rawGemTemplates = await (txAny as any).itemTemplate.findMany({
      where: { name: { in: rawGemNames }, itemType: 'resource' },
      select: { id: true, name: true },
    }) as Array<{ id: string; name: string }>;
    const rawGemIdSet = new Set(rawGemTemplates.map(t => t.id));

    // Fetch all refining recipes and filter by raw gem materials in JS
    // (materials is a Json column storing { templateId, quantity } — can't use relational filters)
    const refiningRecipes = await (txAny as any).craftingRecipe.findMany({
      where: { skillType: 'refining' },
      select: {
        resultTemplateId: true,
        resultTemplate: { select: { name: true } },
        materials: true,
      },
    }) as Array<{
      resultTemplateId: string;
      resultTemplate: { name: string };
      materials: Array<{ templateId: string; quantity: number }>;
    }>;

    for (const recipe of refiningRecipes) {
      const usesZoneGem = recipe.materials.some(m => rawGemIdSet.has(m.templateId));
      if (!usesZoneGem) continue;

      cutGemTemplateIds.push({
        templateId: recipe.resultTemplateId,
        name: recipe.resultTemplate.name,
      });
    }
  }

  // Roll 2-4 cut gems from the available pool (random picks with replacement)
  const materials: CacheMaterialDrop[] = [];

  if (cutGemTemplateIds.length > 0) {
    const materialRolls = randomIntInclusive(MATERIAL_ROLLS_MIN, MATERIAL_ROLLS_MAX);
    const materialMap = new Map<string, CacheMaterialDrop>();

    for (let i = 0; i < materialRolls; i++) {
      const picked = cutGemTemplateIds[randomIntInclusive(0, cutGemTemplateIds.length - 1)]!;

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

  // --- Soulbound item roll (unchanged, uses mob family) ---
  let soulboundItem: CacheLootResult['soulboundItem'] = null;

  if (Math.random() < SOULBOUND_DROP_CHANCE) {
    const soulboundRecipes = (await (txAny as any).craftingRecipe.findMany({
      where: {
        soulbound: true,
        mobFamilyId: params.mobFamilyId,
      },
      select: {
        resultTemplateId: true,
        resultTemplate: { select: { name: true, itemType: true, stackable: true, maxDurability: true } },
      },
    })) as Array<{
      resultTemplateId: string;
      resultTemplate: { name: string; itemType: string; stackable: boolean; maxDurability: number };
    }>;

    if (soulboundRecipes.length > 0) {
      const picked = soulboundRecipes[randomIntInclusive(0, soulboundRecipes.length - 1)]!;
      const rarity = rollRarityWithLuck(params.luck);

      const isEquipment = picked.resultTemplate.itemType === 'weapon' || picked.resultTemplate.itemType === 'armor';
      const maxDurability = isEquipment ? picked.resultTemplate.maxDurability : null;

      await tx.item.create({
        data: {
          ownerId: params.playerId,
          templateId: picked.resultTemplateId,
          rarity,
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
        } as any,
      });

      soulboundItem = {
        itemTemplateId: picked.resultTemplateId,
        name: picked.resultTemplate.name,
        rarity,
      };
    }
  }

  return { materials, soulboundItem };
}
