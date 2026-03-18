import { Prisma } from '@pocketrealm/database';
import {
  getChestRarityForEncounterSize,
  getChestRecipeChanceForEncounterSize,
  getUpgradedChestSize,
  rollChestMaterialRolls,
  type ChestRarity,
  type EncounterSiteSize,
} from '@pocketrealm/game-engine';
import { FULL_CLEAR_CONSTANTS, type LootDrop } from '@pocketrealm/shared';
import { randomIntInclusive } from '../utils/random';
import { rollAndGrantDropsTx, type DropTableEntry, type DropGrantResult } from './dropRollingService';
import type { GrantedItemIds } from './stateUpdateHelpers';

interface RecipeUnlockReward {
  recipeId: string;
  resultTemplateId: string;
  recipeName: string;
  soulbound: boolean;
}

interface EncounterSiteChestRewards extends GrantedItemIds {
  chestRarity: ChestRarity;
  materialRolls: number;
  loot: LootDrop[];
  recipeUnlocked: RecipeUnlockReward | null;
  overflow: DropGrantResult['overflow'];
  slotsConsumed: number;
}

export async function grantEncounterSiteChestRewardsTx(
  tx: Prisma.TransactionClient,
  params: {
    playerId: string;
    mobFamilyId: string;
    size: EncounterSiteSize;
    fullClearBonus?: boolean;
    availableSlots?: number;
  }
): Promise<EncounterSiteChestRewards> {
  const effectiveSize = params.fullClearBonus && FULL_CLEAR_CONSTANTS.CHEST_TIER_UPGRADE
    ? getUpgradedChestSize(params.size)
    : params.size;

  const chestRarity = getChestRarityForEncounterSize(effectiveSize);
  const baseRolls = rollChestMaterialRolls(effectiveSize);
  const materialRolls = params.fullClearBonus
    ? Math.ceil(baseRolls * FULL_CLEAR_CONSTANTS.DROP_MULTIPLIER)
    : baseRolls;

  const dropEntries = await tx.chestDropTable.findMany({
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
  });

  const dropResult = await rollAndGrantDropsTx(tx, params.playerId, dropEntries, materialRolls, 'common', params.availableSlots);

  let recipeUnlocked: RecipeUnlockReward | null = null;
  const baseRecipeChance = getChestRecipeChanceForEncounterSize(effectiveSize);
  const recipeChance = params.fullClearBonus
    ? baseRecipeChance * FULL_CLEAR_CONSTANTS.RECIPE_MULTIPLIER
    : baseRecipeChance;
  const rolledRecipe = Math.random() < recipeChance;
  if (rolledRecipe) {
    const advancedRecipes = await tx.craftingRecipe.findMany({
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
    });

    if (advancedRecipes.length > 0) {
      const known = await tx.playerRecipe.findMany({
        where: {
          playerId: params.playerId,
          recipeId: { in: advancedRecipes.map((recipe) => recipe.id) },
        },
        select: { recipeId: true },
      });

      const knownRecipeIds = new Set(known.map((entry) => entry.recipeId));
      const unknownRecipes = advancedRecipes.filter((recipe) => !knownRecipeIds.has(recipe.id));

      if (unknownRecipes.length > 0) {
        const pickedRecipe = unknownRecipes[randomIntInclusive(0, unknownRecipes.length - 1)]!;
        await tx.playerRecipe.create({
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
    loot: dropResult.loot,
    recipeUnlocked,
    overflow: dropResult.overflow,
    slotsConsumed: dropResult.slotsConsumed,
    newItemIds: dropResult.newItemIds,
    updatedItemIds: dropResult.updatedItemIds,
  };
}
