import { Prisma, prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';
import { SEASON_STATUSES } from './season.constants';

type ZoneWithStarter = {
  id: string;
  name: string;
  seasonId: string | null;
  description: string | null;
  arrivalText: string | null;
  ambientTexts: Prisma.JsonValue | null;
  environmentalTexts: Prisma.JsonValue | null;
  difficulty: number;
  travelCost: number;
  isStarter: boolean;
  zoneType: string | null;
  zoneExitChance: number | null;
  maxCraftingLevel: number | null;
  turnsToExplore: number | null;
  explorationTiers: Prisma.JsonValue | null;
};

type ItemTemplateRecord = {
  id: string;
  name: string;
  seasonId: string | null;
  itemType: string;
  weightClass: string | null;
  setId: string | null;
  slot: string | null;
  tier: number;
  baseStats: Prisma.JsonValue | null;
  requiredSkill: string | null;
  requiredLevel: number | null;
  maxDurability: number | null;
  stackable: boolean;
  consumableEffect: Prisma.JsonValue | null;
  sellPrice: number | null;
  flavorText: string | null;
};

type MobTemplateRecord = {
  id: string;
  name: string;
  zoneId: string;
  seasonId: string | null;
  level: number;
  hp: number;
  accuracy: number;
  defence: number;
  magicDefence: number;
  evasion: number;
  damageMin: number;
  damageMax: number;
  xpReward: number;
  encounterWeight: number;
  explorationTier: number | null;
  spellPattern: Prisma.JsonValue | null;
  damageType: string | null;
  isExpeditionMob: boolean;
  isBoss: boolean;
  bossAoeDmg: number | null;
  bossBaseHp: number | null;
  flavorAppearance: string | null;
  flavorBehavior: string | null;
  flavorLore: string | null;
};

function cloneZoneData(zone: ZoneWithStarter, seasonId: string) {
  const { id: _id, seasonId: _seasonId, ...data } = zone;
  return {
    ...data,
    ambientTexts: toJsonInput(data.ambientTexts),
    environmentalTexts: toJsonInput(data.environmentalTexts),
    explorationTiers: toJsonInput(data.explorationTiers),
    zoneExitChance: data.zoneExitChance ?? undefined,
    zoneType: data.zoneType ?? undefined,
    maxCraftingLevel: data.maxCraftingLevel ?? undefined,
    turnsToExplore: data.turnsToExplore ?? undefined,
    seasonId,
  };
}

function cloneItemTemplateData(itemTemplate: ItemTemplateRecord, seasonId: string) {
  const { id: _id, seasonId: _seasonId, ...data } = itemTemplate;
  return {
    ...data,
    baseStats: toJsonInput(data.baseStats),
    consumableEffect: toJsonInput(data.consumableEffect),
    requiredSkill: data.requiredSkill ?? undefined,
    requiredLevel: data.requiredLevel ?? undefined,
    maxDurability: data.maxDurability ?? undefined,
    setId: data.setId ?? undefined,
    slot: data.slot ?? undefined,
    weightClass: data.weightClass ?? undefined,
    sellPrice: data.sellPrice ?? undefined,
    flavorText: data.flavorText ?? undefined,
    seasonId,
  };
}

function cloneMobTemplateData(
  mobTemplate: MobTemplateRecord,
  seasonId: string,
  zoneId: string,
) {
  const { id: _id, seasonId: _seasonId, zoneId: _zoneId, ...data } = mobTemplate;
  return {
    ...data,
    explorationTier: data.explorationTier ?? undefined,
    spellPattern: toJsonInput(data.spellPattern),
    bossAoeDmg: data.bossAoeDmg ?? undefined,
    bossBaseHp: data.bossBaseHp ?? undefined,
    damageType: data.damageType ?? undefined,
    flavorAppearance: data.flavorAppearance ?? undefined,
    flavorBehavior: data.flavorBehavior ?? undefined,
    flavorLore: data.flavorLore ?? undefined,
    seasonId,
    zoneId,
  };
}

function toJsonInput(value: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === null) {
    return Prisma.JsonNull;
  }

  return value as Prisma.InputJsonValue;
}

function remapRecipeMaterials(
  materials: Prisma.JsonValue | null,
  itemTemplateIdMap: Map<string, string>,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (materials === null) {
    return Prisma.JsonNull;
  }

  if (!Array.isArray(materials)) {
    return materials as Prisma.InputJsonValue;
  }

  return materials.map((material) => {
    if (!material || typeof material !== 'object' || Array.isArray(material)) {
      return material;
    }

    const entry = material as Record<string, unknown>;
    const remapped = { ...entry };

    if (typeof entry.templateId === 'string') {
      remapped.templateId = itemTemplateIdMap.get(entry.templateId) ?? entry.templateId;
    }

    if (typeof entry.itemTemplateId === 'string') {
      remapped.itemTemplateId = itemTemplateIdMap.get(entry.itemTemplateId) ?? entry.itemTemplateId;
    }

    return remapped;
  }) as Prisma.InputJsonValue;
}

export async function bootstrapSeason(seasonId: string): Promise<{ seasonId: string }> {
  return prisma.$transaction(async (tx) => {
    const season = await tx.season.findUniqueOrThrow({
      where: { id: seasonId },
      select: { id: true, status: true },
    });

    if (season.status !== SEASON_STATUSES.UPCOMING) {
      throw new AppError(400, 'Season must be upcoming to bootstrap', 'SEASON_NOT_UPCOMING');
    }

    const existingSeasonContent = await Promise.all([
      tx.zone.findFirst({ where: { seasonId }, select: { id: true } }),
      tx.itemTemplate.findFirst({ where: { seasonId }, select: { id: true } }),
      tx.mobTemplate.findFirst({ where: { seasonId }, select: { id: true } }),
      tx.craftingRecipe.findFirst({ where: { seasonId }, select: { id: true } }),
    ]);

    if (existingSeasonContent.some(Boolean)) {
      throw new AppError(409, 'Season already bootstrapped', 'SEASON_ALREADY_BOOTSTRAPPED');
    }

    const [zones, itemTemplates, mobTemplates] = await Promise.all([
      tx.zone.findMany({
        where: { seasonId: null },
      }) as Promise<ZoneWithStarter[]>,
      tx.itemTemplate.findMany({
        where: { seasonId: null },
      }) as Promise<ItemTemplateRecord[]>,
      tx.mobTemplate.findMany({
        where: { seasonId: null },
      }) as Promise<MobTemplateRecord[]>,
    ]);

    const zoneIdMap = new Map<string, string>();
    for (const zone of zones) {
      const created = await tx.zone.create({
        data: cloneZoneData(zone, seasonId),
      });
      zoneIdMap.set(zone.id, created.id);
    }

    const itemTemplateIdMap = new Map<string, string>();
    for (const itemTemplate of itemTemplates) {
      const created = await tx.itemTemplate.create({
        data: cloneItemTemplateData(itemTemplate, seasonId),
      });
      itemTemplateIdMap.set(itemTemplate.id, created.id);
    }

    const mobTemplateIdMap = new Map<string, string>();
    for (const mobTemplate of mobTemplates) {
      const mappedZoneId = zoneIdMap.get(mobTemplate.zoneId);
      if (!mappedZoneId) {
        throw new AppError(500, `Missing cloned zone for mob template ${mobTemplate.id}`, 'BOOTSTRAP_ZONE_MAP_MISSING');
      }

      const created = await tx.mobTemplate.create({
        data: cloneMobTemplateData(mobTemplate, seasonId, mappedZoneId),
      });
      mobTemplateIdMap.set(mobTemplate.id, created.id);
    }

    const permanentZoneIds = zones.map((zone) => zone.id);
    const permanentMobTemplateIds = mobTemplates.map((mobTemplate) => mobTemplate.id);
    const permanentItemTemplateIds = itemTemplates.map((itemTemplate) => itemTemplate.id);

    const [zoneConnections, dropTables, chestDropTables, resourceNodes, craftingRecipes, zoneMobFamilies] = await Promise.all([
      tx.zoneConnection.findMany({
        where: {
          fromId: { in: permanentZoneIds },
          toId: { in: permanentZoneIds },
        },
      }),
      tx.dropTable.findMany({
        where: {
          mobTemplateId: { in: permanentMobTemplateIds },
          itemTemplateId: { in: permanentItemTemplateIds },
        },
      }),
      tx.chestDropTable.findMany({
        where: {
          itemTemplateId: { in: permanentItemTemplateIds },
        },
      }),
      tx.resourceNode.findMany({
        where: {
          zoneId: { in: permanentZoneIds },
        },
      }),
      tx.craftingRecipe.findMany({
        where: { seasonId: null },
      }),
      tx.zoneMobFamily.findMany({
        where: {
          zoneId: { in: permanentZoneIds },
        },
      }),
    ]);

    if (zoneConnections.length > 0) {
      await tx.zoneConnection.createMany({
        data: zoneConnections.map((connection) => {
          const fromId = zoneIdMap.get(connection.fromId);
          const toId = zoneIdMap.get(connection.toId);
          if (!fromId || !toId) {
            throw new AppError(500, 'Missing cloned zone for zone connection', 'BOOTSTRAP_ZONE_MAP_MISSING');
          }

          return {
            fromId,
            toId,
            explorationThreshold: connection.explorationThreshold,
          };
        }),
      });
    }

    if (dropTables.length > 0) {
      await tx.dropTable.createMany({
        data: dropTables.map((dropTable) => {
          const mobTemplateId = mobTemplateIdMap.get(dropTable.mobTemplateId);
          const itemTemplateId = itemTemplateIdMap.get(dropTable.itemTemplateId);
          if (!mobTemplateId || !itemTemplateId) {
            throw new AppError(500, 'Missing cloned template for drop table', 'BOOTSTRAP_TEMPLATE_MAP_MISSING');
          }

          return {
            mobTemplateId,
            itemTemplateId,
            dropChance: dropTable.dropChance,
            minQuantity: dropTable.minQuantity,
            maxQuantity: dropTable.maxQuantity,
          };
        }),
      });
    }

    if (chestDropTables.length > 0) {
      await tx.chestDropTable.createMany({
        data: chestDropTables.map((dropTable) => {
          const itemTemplateId = itemTemplateIdMap.get(dropTable.itemTemplateId);
          if (!itemTemplateId) {
            throw new AppError(500, 'Missing cloned template for chest drop table', 'BOOTSTRAP_TEMPLATE_MAP_MISSING');
          }

          return {
            mobFamilyId: dropTable.mobFamilyId,
            chestRarity: dropTable.chestRarity,
            itemTemplateId,
            dropChance: dropTable.dropChance,
            minQuantity: dropTable.minQuantity,
            maxQuantity: dropTable.maxQuantity,
          };
        }),
      });
    }

    if (resourceNodes.length > 0) {
      await tx.resourceNode.createMany({
        data: resourceNodes.map((resourceNode) => {
          const zoneId = zoneIdMap.get(resourceNode.zoneId);
          if (!zoneId) {
            throw new AppError(500, 'Missing cloned zone for resource node', 'BOOTSTRAP_ZONE_MAP_MISSING');
          }

          return {
            zoneId,
            resourceType: resourceNode.resourceType,
            skillRequired: resourceNode.skillRequired,
            levelRequired: resourceNode.levelRequired,
            baseYield: resourceNode.baseYield,
            discoveryChance: resourceNode.discoveryChance,
            minCapacity: resourceNode.minCapacity,
            maxCapacity: resourceNode.maxCapacity,
            discoveryWeight: resourceNode.discoveryWeight,
          };
        }),
      });
    }

    if (craftingRecipes.length > 0) {
      await tx.craftingRecipe.createMany({
        data: craftingRecipes.map((recipe) => ({
          seasonId,
          skillType: recipe.skillType,
          requiredLevel: recipe.requiredLevel,
          resultTemplateId: itemTemplateIdMap.get(recipe.resultTemplateId) ?? recipe.resultTemplateId,
          isAdvanced: recipe.isAdvanced,
          soulbound: recipe.soulbound,
          mobFamilyId: recipe.mobFamilyId,
          turnCost: recipe.turnCost,
          materials: remapRecipeMaterials(recipe.materials, itemTemplateIdMap),
          xpReward: recipe.xpReward,
        })),
      });
    }

    if (zoneMobFamilies.length > 0) {
      await tx.zoneMobFamily.createMany({
        data: zoneMobFamilies.map((zoneMobFamily) => {
          const zoneId = zoneIdMap.get(zoneMobFamily.zoneId);
          if (!zoneId) {
            throw new AppError(500, 'Missing cloned zone for zone mob family', 'BOOTSTRAP_ZONE_MAP_MISSING');
          }

          return {
            zoneId,
            mobFamilyId: zoneMobFamily.mobFamilyId,
            discoveryWeight: zoneMobFamily.discoveryWeight,
            minSize: zoneMobFamily.minSize,
            maxSize: zoneMobFamily.maxSize,
          };
        }),
      });
    }

    return {
      seasonId: season.id,
    };
  });
}
