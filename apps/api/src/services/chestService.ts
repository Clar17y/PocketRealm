import { Prisma } from '@pocketrealm/database';
import {
  getChestAdvancedItemChanceForRoomCount,
  getChestRarityForRoomCount,
  getChestRecipeChanceForRoomCount,
  rollChestMaterialRollsByRoomCount,
  type ChestRarity,
} from '@pocketrealm/game-engine';
import { ENCOUNTER_SITE_CONSTANTS, ENCOUNTER_SITE_ROLE_CONSTANTS, type EncounterMobRole, type LootDrop } from '@pocketrealm/shared';
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
  zone?: {
    name: string;
  } | null;
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

interface AdvancedFamilyRecipe {
  id: string;
  resultTemplateId: string;
  soulbound: boolean;
  resultTemplate: {
    name: string;
    itemType: string;
    stackable: boolean;
    maxDurability: number;
  };
}

interface EncounterSiteChestRewards extends GrantedItemIds {
  chestRarity: ChestRarity;
  materialRolls: number;
  loot: LootDrop[];
  recipeUnlocked: RecipeUnlockReward | null;
  overflow: DropGrantResult['overflow'];
  slotsConsumed: number;
}

export type EncounterSiteDefeatedPromotedRoleCounts = Partial<Record<Exclude<EncounterMobRole, 'trash'>, number>>;

const CHEST_DROP_ENTRY_INCLUDE = {
  mobFamily: {
    select: { name: true },
  },
  zone: {
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

const ADVANCED_FAMILY_RECIPE_SELECT = {
  id: true,
  resultTemplateId: true,
  soulbound: true,
  resultTemplate: {
    select: {
      name: true,
      itemType: true,
      stackable: true,
      maxDurability: true,
    },
  },
} as const;

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
  ['Bandits', new Set(['Bandit Cloth'])],
  ['Goblins', new Set(['Crude Gemstone'])],
  ['Treants', new Set(['Ancient Bark'])],
  ['Fae', new Set(['Fae Silk'])],
  ['Golems', new Set(['Crystal Shard'])],
  ['Undead', new Set(['Wraith Essence'])],
  ['Swamp Beasts', new Set(['Croc Hide'])],
  ['Witches', new Set(['Witch Cloth'])],
  ['Elementals', new Set(['Dark Crystal'])],
  ['Serpents', new Set(['Naga Scale'])],
  ['Abominations', new Set(['Eldritch Fragment'])],
]);

const PREFERRED_SIGNATURE_RESOURCE_NAMES_BY_FAMILY_ZONE = new Map<string, Set<string>>([
  ['Bandits|Deep Forest', new Set(['Bandit Cloth'])],
  ['Bandits|Whispering Plains', new Set(['Bandit Cloth'])],
  ['Wolves|Deep Forest', new Set(['Wolf Pelt'])],
  ['Wolves|Whispering Plains', new Set(['Warg Hide'])],
  ['Fae|Ancient Grove', new Set(['Fae Silk'])],
  ['Undead|Haunted Marsh', new Set(['Wraith Essence'])],
  ['Undead|Sunken Ruins', new Set(['Spectral Silk'])],
  ['Swamp Beasts|Haunted Marsh', new Set(['Croc Hide'])],
  ['Goblins|Crystal Caverns', new Set(['Goblin Gold'])],
  ['Golems|Crystal Caverns', new Set(['Dark Crystal'])],
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
  const zoneName = entry.zone?.name;
  const itemName = getResourceItemName(entry);
  if (typeof familyName !== 'string' || itemName == null) return false;

  if (typeof zoneName === 'string') {
    const zonePreferred = PREFERRED_SIGNATURE_RESOURCE_NAMES_BY_FAMILY_ZONE.get(`${familyName}|${zoneName}`);
    if (zonePreferred) return zonePreferred.has(itemName);
  }

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

function getRandomChestDropEntries(entries: ChestDropEntry[]): ChestDropEntry[] {
  const allowedEntries = entries.filter(isAllowedRandomChestDrop);
  return allowedEntries.every((entry) => entry.itemTemplate.itemType === 'consumable')
    ? []
    : allowedEntries;
}

function getRoleBonusChestDropEntries(entries: ChestDropEntry[]): ChestDropEntry[] {
  return entries.filter((entry) => entry.itemTemplate.itemType === 'resource');
}

function getPromotedRoleRewardBonus(counts: EncounterSiteDefeatedPromotedRoleCounts | undefined): {
  materialRollMultiplier: number;
  signatureRolls: number;
} {
  if (!counts) return { materialRollMultiplier: 0, signatureRolls: 0 };

  const eliteCount = Math.max(0, counts.elite ?? 0);
  const miniBossCount = Math.max(0, counts.mini_boss ?? 0);
  return {
    materialRollMultiplier:
      eliteCount * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.elite.materialRollMultiplier
      + miniBossCount * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.mini_boss.materialRollMultiplier,
    signatureRolls:
      eliteCount * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.elite.signatureRolls
      + miniBossCount * ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_REWARD_BONUSES.mini_boss.signatureRolls,
  };
}

function remainingSlotsAfter(
  availableSlots: number | undefined,
  ...results: Array<DropGrantResult | null>
): number | undefined {
  if (availableSlots == null) return undefined;
  const consumed = results.reduce((sum, result) => sum + (result?.slotsConsumed ?? 0), 0);
  return Math.max(0, availableSlots - consumed);
}

async function getChestDropEntriesTx(
  tx: Prisma.TransactionClient,
  mobFamilyId: string,
  chestRarity: ChestRarity | { in: ChestRarity[] },
  zoneId?: string | null,
): Promise<ChestDropEntry[]> {
  if (zoneId) {
    const zoneEntries = await tx.chestDropTable.findMany({
      where: {
        mobFamilyId,
        zoneId,
        chestRarity,
      },
      include: CHEST_DROP_ENTRY_INCLUDE,
    });
    if (zoneEntries.length > 0) return zoneEntries;
  }

  return tx.chestDropTable.findMany({
    where: {
      mobFamilyId,
      zoneId: null,
      chestRarity,
    },
    include: CHEST_DROP_ENTRY_INCLUDE,
  });
}

async function getAdvancedFamilyRecipesTx(
  tx: Prisma.TransactionClient,
  mobFamilyId: string,
): Promise<AdvancedFamilyRecipe[]> {
  return tx.craftingRecipe.findMany({
    where: {
      isAdvanced: true,
      mobFamilyId,
    },
    select: ADVANCED_FAMILY_RECIPE_SELECT,
    orderBy: [{ requiredLevel: 'asc' }, { id: 'asc' }],
  });
}

async function grantAdvancedRecipeResultItemTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  recipes: AdvancedFamilyRecipe[],
  availableSlots?: number,
): Promise<DropGrantResult | null> {
  if (recipes.length === 0) return null;

  const pickedRecipe = recipes[randomIntInclusive(0, recipes.length - 1)]!;
  return rollAndGrantDropsTx(
    tx,
    playerId,
    [{
      itemTemplateId: pickedRecipe.resultTemplateId,
      dropChance: 1,
      minQuantity: 1,
      maxQuantity: 1,
      itemTemplate: pickedRecipe.resultTemplate,
    }],
    1,
    'common',
    availableSlots,
  );
}

async function getSignatureChestDropEntriesTx(
  tx: Prisma.TransactionClient,
  mobFamilyId: string,
  chestRarity: ChestRarity,
  currentDropEntries: ChestDropEntry[],
  zoneId?: string | null,
): Promise<ChestDropEntry[]> {
  const currentSignatureEntries = currentDropEntries.filter(isFamilySignatureDrop);
  if (currentSignatureEntries.length > 0) return getPreferredSignatureDrops(currentSignatureEntries);

  const fallbackRarities = getHigherChestRarities(chestRarity);
  if (fallbackRarities.length === 0) return [];

  const fallbackEntries = await getChestDropEntriesTx(tx, mobFamilyId, { in: fallbackRarities }, zoneId);
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
    zoneId?: string | null;
    availableSlots?: number;
    defeatedPromotedRoleCounts?: EncounterSiteDefeatedPromotedRoleCounts;
  }
): Promise<EncounterSiteChestRewards> {
  const chestRarity = getChestRarityForRoomCount(params.totalRooms);
  const baseRolls = rollChestMaterialRollsByRoomCount(params.totalRooms);
  const roleRewardBonus = getPromotedRoleRewardBonus(params.defeatedPromotedRoleCounts);

  // Auto-resolve proportional multiplier
  const bonusFraction = params.totalRooms > 0
    ? params.autoResolvedBonusRooms / params.totalRooms
    : 0;
  const baseMaterialRolls = Math.ceil(
    baseRolls * (1 + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER - 1))
  );
  const materialRolls = Math.ceil(
    baseRolls * (
      1
      + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_DROP_MULTIPLIER - 1)
      + roleRewardBonus.materialRollMultiplier
    )
  );
  const roleMaterialRolls = Math.max(0, materialRolls - baseMaterialRolls);

  const dropEntries = await getChestDropEntriesTx(tx, params.mobFamilyId, chestRarity, params.zoneId);
  const signatureEntries = await getSignatureChestDropEntriesTx(
    tx,
    params.mobFamilyId,
    chestRarity,
    dropEntries,
    params.zoneId,
  );
  const randomDropEntries = getRandomChestDropEntries(dropEntries);
  const roleBonusDropEntries = getRoleBonusChestDropEntries(randomDropEntries);
  const signatureResult = signatureEntries.length > 0
    ? await rollAndGrantDropsTx(tx, params.playerId, signatureEntries, 1 + roleRewardBonus.signatureRolls, 'common', params.availableSlots)
    : null;
  const randomDropResult = await rollAndGrantDropsTx(
    tx,
    params.playerId,
    randomDropEntries,
    baseMaterialRolls,
    'common',
    remainingSlotsAfter(params.availableSlots, signatureResult),
  );
  const roleBonusDropResult = roleMaterialRolls > 0 && roleBonusDropEntries.length > 0
    ? await rollAndGrantDropsTx(
        tx,
        params.playerId,
        roleBonusDropEntries,
        roleMaterialRolls,
        'common',
        remainingSlotsAfter(params.availableSlots, signatureResult, randomDropResult),
      )
    : null;
  const materialDropResult = mergeDropGrantResults([
    ...(signatureResult ? [signatureResult] : []),
    randomDropResult,
    ...(roleBonusDropResult ? [roleBonusDropResult] : []),
  ]);
  let dropResult = materialDropResult;

  let recipeUnlocked: RecipeUnlockReward | null = null;
  const baseRecipeChance = getChestRecipeChanceForRoomCount(params.totalRooms);
  const recipeChance = baseRecipeChance * (1 + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER - 1));
  const rolledRecipe = Math.random() < recipeChance;
  const baseAdvancedItemChance = getChestAdvancedItemChanceForRoomCount(params.totalRooms);
  const advancedItemChance = baseAdvancedItemChance * (1 + bonusFraction * (ENCOUNTER_SITE_CONSTANTS.AUTO_RESOLVE_RECIPE_MULTIPLIER - 1));
  let advancedRecipes: AdvancedFamilyRecipe[] | null = null;

  if (rolledRecipe) {
    advancedRecipes = await getAdvancedFamilyRecipesTx(tx, params.mobFamilyId);
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

  const rolledAdvancedItem = recipeUnlocked == null && Math.random() < advancedItemChance;
  if (rolledAdvancedItem) {
    advancedRecipes ??= await getAdvancedFamilyRecipesTx(tx, params.mobFamilyId);

    const remainingSlots = params.availableSlots == null
      ? undefined
      : Math.max(0, params.availableSlots - materialDropResult.slotsConsumed);
    const advancedItemResult = await grantAdvancedRecipeResultItemTx(
      tx,
      params.playerId,
      advancedRecipes,
      remainingSlots,
    );

    if (advancedItemResult) {
      dropResult = mergeDropGrantResults([materialDropResult, advancedItemResult]);
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
