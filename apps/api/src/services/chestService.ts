import { Prisma } from '@pocketrealm/database';
import {
  getChestRarityForRoomCount,
  getChestRecipeChanceForRoomCount,
  rollChestMaterialRollsByRoomCount,
  type ChestRarity,
} from '@pocketrealm/game-engine';
import { ENCOUNTER_SITE_CONSTANTS, type LootDrop } from '@pocketrealm/shared';
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
    totalRooms: number;
    autoResolvedBonusRooms: number;
    availableSlots?: number;
  }
): Promise<EncounterSiteChestRewards> {
  const chestRarity = getChestRarityForRoomCount(params.totalRooms);
  const baseRolls = rollChestMaterialRollsByRoomCount(params.totalRooms);

  // Auto-resolve proportional multiplier
  const bonusFraction = params.totalRooms > 0
    ? params.autoResolvedBonusRooms / params.totalRooms
    : 0;
  const materialRolls = Math.ceil(
    baseRolls * (1 + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER - 1))
  );

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
  const baseRecipeChance = getChestRecipeChanceForRoomCount(params.totalRooms);
  const recipeChance = baseRecipeChance * (1 + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER - 1));
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
