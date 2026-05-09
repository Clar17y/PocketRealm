import { Prisma } from '@pocketrealm/database';
import {
  getChestRarityForRoomCount,
  getChestRecipeChanceForRoomCount,
  rollChestMaterialRollsByRoomCount,
  type ChestRarity,
} from '@pocketrealm/game-engine';
import { ENCOUNTER_SITE_CONSTANTS, type LootDrop } from '@pocketrealm/shared';
import { randomIntInclusive } from '../utils/random';
import {
  createLootAccumulator,
  rollAndGrantDropsTx,
  type DropGrantResult,
  type DropTableEntry,
} from './dropRollingService';
import type { GrantedItemIds } from './stateUpdateHelpers';

type ChestDropEntry = DropTableEntry & {
  chestRarity?: string;
  mobFamily?: {
    name: string;
  };
  itemTemplate: DropTableEntry['itemTemplate'] & {
    name?: string;
  };
};

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

const CHEST_DROP_ENTRY_INCLUDE = {
  mobFamily: {
    select: { name: true },
  },
  itemTemplate: {
    select: {
      name: true,
      itemType: true,
      stackable: true,
      maxDurability: true,
    },
  },
} as const;

const CHEST_RARITIES: ChestRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const AMBIENT_CHEST_RESOURCE_NAMES = new Set([
  'Copper Ore',
  'Tin Ore',
  'Iron Ore',
  'Sandstone',
  'Dark Iron Ore',
  'Mithril Ore',
  'Ancient Ore',
  'Oak Log',
  'Maple Log',
  'Fungal Wood',
  'Elderwood Log',
  'Willow Log',
  'Bogwood Log',
  'Crystal Wood',
  'Petrified Wood',
  'Forest Sage',
  'Moonpetal',
  'Cave Moss',
  'Starbloom',
  'Glowcap Mushroom',
  'Windbloom',
  'Gravemoss',
  'Shimmer Fern',
  'Abyssal Kelp',
]);

const ORE_RESOURCE_NAMES = [
  'Copper Ore',
  'Tin Ore',
  'Iron Ore',
  'Dark Iron Ore',
  'Mithril Ore',
  'Ancient Ore',
];

const LOG_RESOURCE_NAMES = [
  'Oak Log',
  'Maple Log',
  'Fungal Wood',
  'Elderwood Log',
  'Willow Log',
  'Bogwood Log',
  'Crystal Wood',
  'Petrified Wood',
];

const THEMATIC_AMBIENT_RESOURCE_NAMES_BY_FAMILY = new Map<string, Set<string>>([
  ['Treants', new Set(LOG_RESOURCE_NAMES)],
  ['Golems', new Set(ORE_RESOURCE_NAMES)],
  ['Goblins', new Set(ORE_RESOURCE_NAMES)],
]);

const PREFERRED_SIGNATURE_RESOURCE_NAMES_BY_FAMILY = new Map<string, Set<string>>([
  ['Spiders', new Set(['Spider Silk'])],
  ['Boars', new Set(['Boar Hide'])],
  ['Wolves', new Set(['Wolf Pelt'])],
  ['Bandits', new Set(['Stolen Coin'])],
  ['Goblins', new Set(['Stolen Coin'])],
  ['Treants', new Set(['Ancient Bark'])],
]);

function getHigherChestRarities(chestRarity: ChestRarity): ChestRarity[] {
  const rarityIndex = CHEST_RARITIES.indexOf(chestRarity);
  return rarityIndex >= 0 ? CHEST_RARITIES.slice(rarityIndex + 1) : [];
}

function getResourceItemName(entry: ChestDropEntry): string | null {
  const itemName = entry.itemTemplate.name;
  return entry.itemTemplate.itemType === 'resource' && typeof itemName === 'string'
    ? itemName
    : null;
}

function isAmbientChestResource(entry: ChestDropEntry): boolean {
  const itemName = getResourceItemName(entry);
  return itemName != null && AMBIENT_CHEST_RESOURCE_NAMES.has(itemName);
}

function isFamilySignatureDrop(entry: ChestDropEntry): boolean {
  return getResourceItemName(entry) != null && !isAmbientChestResource(entry);
}

function isPreferredSignatureDrop(entry: ChestDropEntry): boolean {
  const familyName = entry.mobFamily?.name;
  const itemName = getResourceItemName(entry);
  if (typeof familyName !== 'string' || itemName == null) return false;

  return PREFERRED_SIGNATURE_RESOURCE_NAMES_BY_FAMILY.get(familyName)?.has(itemName) ?? false;
}

function getPreferredSignatureDrops(entries: ChestDropEntry[]): ChestDropEntry[] {
  const preferredEntries = entries.filter(isPreferredSignatureDrop);

  return preferredEntries.length > 0 ? preferredEntries : entries;
}

function isThematicAmbientResource(entry: ChestDropEntry): boolean {
  const itemName = getResourceItemName(entry);
  const familyName = entry.mobFamily?.name;
  if (itemName == null || typeof familyName !== 'string') return false;

  return THEMATIC_AMBIENT_RESOURCE_NAMES_BY_FAMILY.get(familyName)?.has(itemName) ?? false;
}

function isAllowedRandomChestDrop(entry: ChestDropEntry): boolean {
  return !isAmbientChestResource(entry) || isThematicAmbientResource(entry);
}

async function getChestDropEntriesTx(
  tx: Prisma.TransactionClient,
  mobFamilyId: string,
  chestRarity: ChestRarity | { in: ChestRarity[] }
): Promise<ChestDropEntry[]> {
  return tx.chestDropTable.findMany({
    where: {
      mobFamilyId,
      chestRarity,
    },
    include: CHEST_DROP_ENTRY_INCLUDE,
  });
}

async function getSignatureChestDropEntriesTx(
  tx: Prisma.TransactionClient,
  mobFamilyId: string,
  chestRarity: ChestRarity,
  currentDropEntries: ChestDropEntry[]
): Promise<ChestDropEntry[]> {
  const currentSignatureEntries = currentDropEntries.filter(isFamilySignatureDrop);
  if (currentSignatureEntries.length > 0) return getPreferredSignatureDrops(currentSignatureEntries);

  const fallbackRarities = getHigherChestRarities(chestRarity);
  if (fallbackRarities.length === 0) return [];

  const fallbackEntries = await getChestDropEntriesTx(tx, mobFamilyId, { in: fallbackRarities });
  for (const fallbackRarity of fallbackRarities) {
    const signatureEntries = fallbackEntries.filter(
      (entry) => entry.chestRarity === fallbackRarity && isFamilySignatureDrop(entry)
    );
    if (signatureEntries.length > 0) return getPreferredSignatureDrops(signatureEntries);
  }

  return [];
}

function mergeDropGrantResults(results: DropGrantResult[]): DropGrantResult {
  const accumulator = createLootAccumulator();
  const overflow: DropGrantResult['overflow'] = [];
  const newItemIds = new Set<string>();
  const updatedItemIds = new Set<string>();
  let slotsConsumed = 0;

  for (const result of results) {
    for (const drop of result.loot) {
      accumulator.add(drop);
    }

    overflow.push(...result.overflow);
    result.newItemIds.forEach((id) => newItemIds.add(id));
    result.updatedItemIds.forEach((id) => updatedItemIds.add(id));
    slotsConsumed += result.slotsConsumed;
  }

  return {
    loot: accumulator.toArray(),
    overflow,
    slotsConsumed,
    newItemIds: Array.from(newItemIds),
    updatedItemIds: Array.from(updatedItemIds),
  };
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

  const dropEntries = await getChestDropEntriesTx(tx, params.mobFamilyId, chestRarity);
  const signatureEntries = await getSignatureChestDropEntriesTx(tx, params.mobFamilyId, chestRarity, dropEntries);
  const randomDropEntries = dropEntries.filter(isAllowedRandomChestDrop);
  const signatureResult = signatureEntries.length > 0
    ? await rollAndGrantDropsTx(tx, params.playerId, signatureEntries, 1, 'common', params.availableSlots)
    : null;
  const remainingSlots = params.availableSlots == null || !signatureResult
    ? params.availableSlots
    : Math.max(0, params.availableSlots - signatureResult.slotsConsumed);
  const randomDropResult = await rollAndGrantDropsTx(tx, params.playerId, randomDropEntries, materialRolls, 'common', remainingSlots);
  const dropResult = signatureResult
    ? mergeDropGrantResults([signatureResult, randomDropResult])
    : randomDropResult;

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
