import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@pocketrealm/shared', async () => import('../../../shared/src/index'));

import { getAllChestDropTables } from './chests';
import { IDS } from './ids';
import { getAllItemTemplates } from './items';
import { getAllRecipes } from './recipes';

type ChestDropRow = ReturnType<typeof getAllChestDropTables>[number] & {
  zoneId?: string | null;
};
type RecipeSeedRow = ReturnType<typeof getAllRecipes>[number];

const allItemTemplates = getAllItemTemplates();
const allRecipes = getAllRecipes();
const itemTemplates = new Map(allItemTemplates.map((item) => [item.id, item]));
const itemTemplateIdsByName = new Map(allItemTemplates.map((item) => [item.name, item.id]));
const recipesByResultTemplateId = new Map(allRecipes.map((recipe) => [recipe.resultTemplateId, recipe]));
const ZONE_ID_CHEST_MIGRATION = '20260629190000_add_chest_drop_table_zone_id';
const CHEST_BALANCE_BACKFILL_MIGRATION = '20260630162000_backfill_zone_specific_chest_rewards';

function getItemId(name: string): string {
  const itemTemplateId = itemTemplateIdsByName.get(name);
  if (!itemTemplateId) throw new Error(`Missing item template: ${name}`);
  return itemTemplateId;
}

function addDemand(demand: Map<string, number>, itemTemplateId: string, quantity: number): void {
  demand.set(itemTemplateId, (demand.get(itemTemplateId) ?? 0) + quantity);
}

function expandMaterialDemand(
  itemTemplateId: string,
  quantity: number,
  seenRecipeResults = new Set<string>(),
): Map<string, number> {
  const recipe = recipesByResultTemplateId.get(itemTemplateId);
  if (!recipe) return new Map([[itemTemplateId, quantity]]);

  if (seenRecipeResults.has(itemTemplateId)) {
    throw new Error(`Circular recipe dependency involving ${itemTemplateId}`);
  }

  const expanded = new Map<string, number>();
  const nextSeen = new Set(seenRecipeResults).add(itemTemplateId);
  for (const material of recipe.materials) {
    const materialDemand = expandMaterialDemand(material.templateId, quantity * material.quantity, nextSeen);
    for (const [rawItemTemplateId, rawQuantity] of materialDemand) {
      addDemand(expanded, rawItemTemplateId, rawQuantity);
    }
  }

  return expanded;
}

function expandedDemandForRecipe(recipe: RecipeSeedRow): Map<string, number> {
  const demand = new Map<string, number>();
  for (const material of recipe.materials) {
    const materialDemand = expandMaterialDemand(material.templateId, material.quantity);
    for (const [itemTemplateId, quantity] of materialDemand) {
      addDemand(demand, itemTemplateId, quantity);
    }
  }
  return demand;
}

function expandedDemandForCraftedItems(): Map<string, number> {
  const demand = new Map<string, number>();
  for (const recipe of allRecipes) {
    const resultTemplate = itemTemplates.get(recipe.resultTemplateId);
    if (resultTemplate?.itemType === 'resource') continue;

    for (const [itemTemplateId, quantity] of expandedDemandForRecipe(recipe)) {
      addDemand(demand, itemTemplateId, quantity);
    }
  }
  return demand;
}

function chestRowsForFamilyZoneRarity(
  familyId: string,
  zoneId: string,
  chestRarity: string,
): ChestDropRow[] {
  const rows = getAllChestDropTables() as ChestDropRow[];
  const exactRows = rows.filter(
    (row) => row.mobFamilyId === familyId
      && row.zoneId === zoneId
      && row.chestRarity === chestRarity,
  );

  return exactRows.length > 0
    ? exactRows
    : rows.filter(
        (row) => row.mobFamilyId === familyId
          && (row.zoneId ?? null) === null
          && row.chestRarity === chestRarity,
      );
}

function expectedQuantity(rows: ChestDropRow[], itemTemplateId: string): number {
  return rows
    .filter((row) => row.itemTemplateId === itemTemplateId)
    .reduce((sum, row) => sum + row.dropChance * ((row.minQuantity + row.maxQuantity) / 2), 0);
}

function chestBalanceBackfillMigrationSql(): string {
  return readFileSync(
    resolve(process.cwd(), 'prisma', 'migrations', CHEST_BALANCE_BACKFILL_MIGRATION, 'migration.sql'),
    'utf8',
  );
}

describe('encounter chest crafting reward balance', () => {
  it('expands processed crafting materials down to their raw recipe demand', () => {
    const reinforcedPackRecipe = allRecipes.find(
      (recipe) => recipe.resultTemplateId === IDS.backpack.reinforcedPack,
    );
    if (!reinforcedPackRecipe) throw new Error('Missing Reinforced Pack recipe');

    const expandedDemand = expandedDemandForRecipe(reinforcedPackRecipe);

    expect(expandedDemand.get(IDS.drop.banditCloth)).toBe(18);
    expect(expandedDemand.get(IDS.drop.wolfPelt)).toBe(8);
    expect(expandedDemand.has(IDS.leather.wovenCloth)).toBe(false);
    expect(expandedDemand.has(IDS.leather.wolfLeather)).toBe(false);
  });

  it('weights Deep Forest bandit chests toward Bandit Cloth instead of Stolen Coin', () => {
    const rareBanditRows = chestRowsForFamilyZoneRarity(IDS.families.bandits, IDS.zones.deepForest, 'rare');

    expect(expectedQuantity(rareBanditRows, IDS.drop.banditCloth))
      .toBeGreaterThan(expectedQuantity(rareBanditRows, IDS.drop.stolenCoin));
  });

  it('lets common Deep Forest bandit chests produce Bandit Cloth', () => {
    const commonBanditRows = chestRowsForFamilyZoneRarity(IDS.families.bandits, IDS.zones.deepForest, 'common');

    expect(commonBanditRows.some((row) => row.itemTemplateId === IDS.drop.banditCloth)).toBe(true);
  });

  it('backfills zone-specific chest balance through a migration for existing databases', () => {
    expect(CHEST_BALANCE_BACKFILL_MIGRATION.localeCompare(ZONE_ID_CHEST_MIGRATION)).toBeGreaterThan(0);

    const migrationSql = chestBalanceBackfillMigrationSql();

    for (const requiredFragment of ['chest_drop_tables', 'zone_id', 'Bandits', 'Deep Forest', 'Bandit Cloth', 'Stolen Coin']) {
      expect(migrationSql).toContain(requiredFragment);
    }
  });

  it('provides chest sources for high-demand zone-specific crafting drops', () => {
    const expandedDemand = expandedDemandForCraftedItems();
    const requiredSources = [
      { itemName: 'Warg Hide', itemTemplateId: IDS.drop.wargHide, familyId: IDS.families.wolves, zoneId: IDS.zones.whisperingPlains },
      { itemName: 'Fae Silk', itemTemplateId: IDS.drop.faeSilk, familyId: IDS.families.fae, zoneId: IDS.zones.ancientGrove },
      { itemName: 'Spectral Silk', itemTemplateId: IDS.drop.spectralSilk, familyId: IDS.families.undead, zoneId: IDS.zones.sunkenRuins },
      { itemName: 'Croc Hide', itemTemplateId: IDS.drop.crocHide, familyId: IDS.families.swampBeasts, zoneId: IDS.zones.hauntedMarsh },
      { itemName: 'Goblin Gold', itemTemplateId: IDS.drop.goblinGold, familyId: IDS.families.goblins, zoneId: IDS.zones.crystalCaverns },
      { itemName: 'Cut Gem', itemTemplateId: IDS.drop.cutGem, familyId: IDS.families.goblins, zoneId: IDS.zones.crystalCaverns },
      { itemName: 'Dark Crystal', itemTemplateId: IDS.drop.darkCrystal, familyId: IDS.families.golems, zoneId: IDS.zones.crystalCaverns },
    ];
    const chestRows = getAllChestDropTables() as ChestDropRow[];

    for (const source of requiredSources) {
      expect(expandedDemand.get(source.itemTemplateId), `${source.itemName} should be used by recipes`)
        .toBeGreaterThan(0);
      expect(
        chestRows.some((row) => row.itemTemplateId === source.itemTemplateId
          && row.mobFamilyId === source.familyId
          && row.zoneId === source.zoneId),
        `${source.itemName} should have a matching zone chest source`,
      ).toBe(true);
    }
  });

  it('does not keep chest rows for materials with no current recipe sink', () => {
    const expandedDemand = expandedDemandForCraftedItems();
    const noSinkItemIds = [
      getItemId('Bat Fang'),
      getItemId('Ooze Residue'),
      getItemId('Ancient Relic'),
    ];
    const chestRows = getAllChestDropTables();

    for (const itemTemplateId of noSinkItemIds) {
      expect(expandedDemand.has(itemTemplateId)).toBe(false);
      expect(chestRows.some((row) => row.itemTemplateId === itemTemplateId)).toBe(false);
    }
  });
});
