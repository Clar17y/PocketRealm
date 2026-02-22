import { Prisma } from '@adventure/database';
import {
  getChestRarityForEncounterSize,
  getChestRecipeChanceForEncounterSize,
  getUpgradedChestSize,
  rollChestMaterialRolls,
  type ChestRarity,
  type EncounterSiteSize,
} from '@adventure/game-engine';
import { FULL_CLEAR_CONSTANTS, type LootDrop } from '@adventure/shared';
import { randomIntInclusive } from '../utils/random';
import { addStackableItemTx } from './inventoryService';
import { pickWeighted } from '../utils/pickWeighted.js';

export interface RecipeUnlockReward {
  recipeId: string;
  resultTemplateId: string;
  recipeName: string;
  soulbound: boolean;
}

export interface EncounterSiteChestRewards {
  chestRarity: ChestRarity;
  materialRolls: number;
  loot: LootDrop[];
  recipeUnlocked: RecipeUnlockReward | null;
}

function decimalLikeToNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toNumber' in (value as Record<string, unknown>)) {
    const maybeNumber = (value as { toNumber: () => number }).toNumber();
    return Number.isFinite(maybeNumber) ? maybeNumber : 0;
  }
  return 0;
}

interface ChestDropEntry {
  itemTemplateId: string;
  dropChance: unknown;
  minQuantity: number;
  maxQuantity: number;
  itemTemplate: {
    itemType: string;
    stackable: boolean;
    maxDurability: number;
  };
}

export async function grantEncounterSiteChestRewardsTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    mobFamilyId: string;
    size: EncounterSiteSize;
    fullClearBonus?: boolean;
  }
): Promise<EncounterSiteChestRewards> {
  const txAny = tx as unknown as any;
  const effectiveSize = params.fullClearBonus && FULL_CLEAR_CONSTANTS.CHEST_TIER_UPGRADE
    ? getUpgradedChestSize(params.size)
    : params.size;

  const chestRarity = getChestRarityForEncounterSize(effectiveSize);
  const baseRolls = rollChestMaterialRolls(effectiveSize);
  const materialRolls = params.fullClearBonus
    ? Math.ceil(baseRolls * FULL_CLEAR_CONSTANTS.DROP_MULTIPLIER)
    : baseRolls;

  const dropEntries = (await txAny.chestDropTable.findMany({
    where: {
      mobFamilyId: params.mobFamilyId,
      chestRarity,
    },
    include: {
      itemTemplate: {
        select: {
          itemType: true,
          stackable: true,
          maxDurability: true,
        },
      },
    },
  })) as ChestDropEntry[];

  const lootByTemplate = new Map<string, LootDrop>();
  const addLoot = (drop: LootDrop): void => {
    const existing = lootByTemplate.get(drop.itemTemplateId);
    if (existing) {
      existing.quantity += drop.quantity;
      return;
    }
    lootByTemplate.set(drop.itemTemplateId, { ...drop });
  };

  for (let i = 0; i < materialRolls; i++) {
    const picked = pickWeighted(dropEntries, e => Math.max(0, decimalLikeToNumber(e.dropChance)));
    if (!picked) continue;

    const quantity = Math.max(1, randomIntInclusive(picked.minQuantity, picked.maxQuantity));

    if (picked.itemTemplate.stackable) {
      await addStackableItemTx(tx, params.playerId, picked.itemTemplateId, quantity);
      addLoot({ itemTemplateId: picked.itemTemplateId, quantity, rarity: 'common' });
      continue;
    }

    const isEquipment = picked.itemTemplate.itemType === 'weapon' || picked.itemTemplate.itemType === 'armor';
    const maxDurability = isEquipment ? picked.itemTemplate.maxDurability : null;

    for (let q = 0; q < quantity; q++) {
      await tx.item.create({
        data: {
          ownerId: params.playerId,
          templateId: picked.itemTemplateId,
          rarity: 'common',
          quantity: 1,
          maxDurability,
          currentDurability: maxDurability,
        } as any,
      });
    }
    addLoot({ itemTemplateId: picked.itemTemplateId, quantity, rarity: 'common' });
  }

  let recipeUnlocked: RecipeUnlockReward | null = null;
  const baseRecipeChance = getChestRecipeChanceForEncounterSize(effectiveSize);
  const recipeChance = params.fullClearBonus
    ? baseRecipeChance * FULL_CLEAR_CONSTANTS.RECIPE_MULTIPLIER
    : baseRecipeChance;
  const rolledRecipe = Math.random() < recipeChance;
  if (rolledRecipe) {
    const advancedRecipes = (await txAny.craftingRecipe.findMany({
      where: {
        isAdvanced: true,
        mobFamilyId: params.mobFamilyId,
      },
      select: {
        id: true,
        resultTemplateId: true,
        soulbound: true,
        resultTemplate: {
          select: { name: true },
        },
      },
      orderBy: [{ requiredLevel: 'asc' }, { id: 'asc' }],
    })) as Array<{
      id: string;
      resultTemplateId: string;
      soulbound: boolean;
      resultTemplate: { name: string };
    }>;

    if (advancedRecipes.length > 0) {
      const known = (await txAny.playerRecipe.findMany({
        where: {
          playerId: params.playerId,
          recipeId: { in: advancedRecipes.map((recipe) => recipe.id) },
        },
        select: { recipeId: true },
      })) as Array<{ recipeId: string }>;

      const knownRecipeIds = new Set(known.map((entry) => entry.recipeId));
      const unknownRecipes = advancedRecipes.filter((recipe) => !knownRecipeIds.has(recipe.id));

      if (unknownRecipes.length > 0) {
        const pickedRecipe = unknownRecipes[randomIntInclusive(0, unknownRecipes.length - 1)]!;
        await txAny.playerRecipe.create({
          data: {
            playerId: params.playerId,
            recipeId: pickedRecipe.id,
          },
        });

        recipeUnlocked = {
          recipeId: pickedRecipe.id,
          resultTemplateId: pickedRecipe.resultTemplateId,
          recipeName: pickedRecipe.resultTemplate.name,
          soulbound: Boolean(pickedRecipe.soulbound),
        };
      }
    }
  }

  return {
    chestRarity,
    materialRolls,
    loot: Array.from(lootByTemplate.values()),
    recipeUnlocked,
  };
}
