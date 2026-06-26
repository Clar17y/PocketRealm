import { prisma } from '@pocketrealm/database';
import { SEASON_STATUSES, type ItemStats } from '@pocketrealm/shared';
import { matchLookupName, normalizeLookupName } from './discordLookupMatch';

export interface ItemCardData {
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  weightClass: string | null;
  requiredSkill: string | null;
  requiredLevel: number;
  sellPrice: number | null;
  flavorText: string | null;
  season: { name: string } | null;
  stats: Array<{ key: string; value: number }>;
  sources: {
    drops: Array<{ mobName: string; zoneName: string; dropRatePct: number; minQty: number; maxQty: number }>;
    craft: {
      skillType: string;
      requiredLevel: number;
      turnCost: number;
      xpReward: number;
      materials: Array<{ name: string; quantity: number }>;
    } | null;
  };
}

export interface MobCardData {
  name: string;
  isBoss: boolean;
  isExpeditionMob: boolean;
  season: { name: string } | null;
  zones: string[];
  flavorAppearance: string | null;
  drops: Array<{ itemName: string; itemType: string; tier: number; dropRatePct: number; minQty: number; maxQty: number }>;
}

export interface ResourceCardData {
  query: string;
  resources: Array<{
    name: string;
    tier: number | null;
    zones: Array<{
      name: string;
      skillRequired: string;
      levelRequired: number;
      baseYield: number;
      discoveryChancePct: number;
      minCapacity: number;
      maxCapacity: number;
    }>;
  }>;
}

export interface ItemLookupResult { match: ItemCardData | null; suggestions: string[]; }
export interface MobLookupResult { match: MobCardData | null; suggestions: string[]; }
export interface ResourceLookupResult { match: ResourceCardData | null; suggestions: string[]; }

type ResourceZoneCardData = ResourceCardData['resources'][number]['zones'][number];
type ResourceZoneLookupData = ResourceZoneCardData & { difficulty: number };

const STAT_ORDER: Array<keyof ItemStats> = [
  'attack', 'magicPower', 'rangedPower', 'accuracy', 'dodge', 'armor',
  'magicDefence', 'health', 'luck', 'critChance', 'critDamage', 'inventorySlots',
];

function dropRatePct(dropChance: unknown): number {
  return Math.round(Number(dropChance) * 10000) / 100;
}

function percentFromRate(value: unknown): number {
  return Math.round(Number(value) * 10000) / 100;
}

interface SeasonRef { id: string; name: string; startsAt?: Date | string | null }
interface SeasonedRow { id: string; seasonId: string | null; season: SeasonRef | null }

function seasonLabel(season: SeasonRef | null | undefined): { name: string } | null {
  return season ? { name: season.name } : null;
}

async function activeSeasonId(): Promise<string | null> {
  const season = await prisma.season.findFirst({
    where: { status: SEASON_STATUSES.ACTIVE },
    select: { id: true },
  });
  return season?.id ?? null;
}

/**
 * Given rows that share the matched name, pick the season scope to display by
 * priority: active season -> base (null) -> most recent season. Returns the
 * rows in that scope plus a season label.
 */
function resolveSeasonScope<T extends SeasonedRow>(
  rows: T[],
  activeId: string | null,
): { scoped: T[]; season: { name: string } | null } {
  const hasActive = activeId !== null && rows.some((row) => row.seasonId === activeId);
  if (hasActive) {
    const scoped = rows.filter((row) => row.seasonId === activeId);
    return { scoped, season: seasonLabel(scoped[0]?.season) };
  }

  const hasBase = rows.some((row) => row.seasonId === null);
  if (hasBase) {
    return { scoped: rows.filter((row) => row.seasonId === null), season: null };
  }

  const sorted = [...rows].sort(
    (a, b) => new Date(b.season?.startsAt ?? 0).getTime() - new Date(a.season?.startsAt ?? 0).getTime(),
  );
  const newestSeasonId = sorted[0]?.seasonId ?? null;
  const scoped = rows.filter((row) => row.seasonId === newestSeasonId);
  return { scoped, season: seasonLabel(scoped[0]?.season) };
}

function resolveResourceNodeScope<T extends { id: string; zone: { seasonId: string | null; season: SeasonRef | null } }>(
  nodes: T[],
  activeId: string | null,
): T[] {
  return resolveSeasonScope(
    nodes.map((node) => ({
      id: node.id,
      seasonId: node.zone.seasonId,
      season: node.zone.season,
      node,
    })),
    activeId,
  ).scoped.map((row) => row.node);
}

export async function lookupItemForDiscord(query: string): Promise<ItemLookupResult> {
  const templates = await prisma.itemTemplate.findMany({
    select: {
      id: true, name: true, itemType: true, slot: true, tier: true, weightClass: true,
      requiredSkill: true, requiredLevel: true, sellPrice: true,
      flavorText: true, baseStats: true, seasonId: true,
      season: { select: { id: true, name: true, startsAt: true } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const { matchedName, suggestions } = matchLookupName(query, templates.map((t) => t.name));
  if (!matchedName) {
    return { match: null, suggestions };
  }

  const normalizedMatch = normalizeLookupName(matchedName);
  const rows = templates.filter((t) => normalizeLookupName(t.name) === normalizedMatch);
  const activeId = rows.length > 1 ? await activeSeasonId() : null;
  const { scoped, season } = resolveSeasonScope(rows, activeId);
  const ids = scoped.map((row) => row.id);
  const primary = scoped[0]!;

  const [dropRows, recipe] = await Promise.all([
    prisma.dropTable.findMany({
      where: { itemTemplateId: { in: ids } },
      select: {
        dropChance: true, minQuantity: true, maxQuantity: true,
        mobTemplate: { select: { name: true, zone: { select: { name: true } } } },
      },
    }),
    // Prefer the standard recipe over advanced/soulbound variants for the same result.
    prisma.craftingRecipe.findFirst({
      where: { resultTemplateId: { in: ids } },
      select: { skillType: true, requiredLevel: true, turnCost: true, xpReward: true, materials: true },
      orderBy: { isAdvanced: 'asc' },
    }),
  ]);
  const drops = dropRows
    .map((row) => ({
      mobName: row.mobTemplate.name,
      zoneName: row.mobTemplate.zone.name,
      dropRatePct: dropRatePct(row.dropChance),
      minQty: row.minQuantity,
      maxQty: row.maxQuantity,
    }))
    .sort((a, b) => b.dropRatePct - a.dropRatePct);

  let craft: ItemCardData['sources']['craft'] = null;
  if (recipe) {
    const materialList = Array.isArray(recipe.materials)
      ? (recipe.materials as Array<{ templateId: string; quantity: number }>)
      : [];
    const matTemplates = materialList.length
      ? await prisma.itemTemplate.findMany({
          where: { id: { in: materialList.map((m) => m.templateId) } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(matTemplates.map((t) => [t.id, t.name]));
    craft = {
      skillType: recipe.skillType,
      requiredLevel: recipe.requiredLevel,
      turnCost: recipe.turnCost,
      xpReward: recipe.xpReward,
      materials: materialList.map((m) => ({
        name: nameById.get(m.templateId) ?? 'Unknown material',
        quantity: m.quantity,
      })),
    };
  }

  const baseStats = (primary.baseStats ?? {}) as ItemStats;
  const stats = STAT_ORDER.flatMap((key) => {
    const value = baseStats[key];
    return typeof value === 'number' && value !== 0 ? [{ key, value }] : [];
  });

  return {
    suggestions: [],
    match: {
      name: primary.name,
      itemType: primary.itemType,
      slot: primary.slot,
      tier: primary.tier,
      weightClass: primary.weightClass,
      requiredSkill: primary.requiredSkill,
      requiredLevel: primary.requiredLevel,
      sellPrice: primary.sellPrice,
      flavorText: primary.flavorText,
      season,
      stats,
      sources: { drops, craft },
    },
  };
}

export async function lookupMobForDiscord(query: string): Promise<MobLookupResult> {
  const templates = await prisma.mobTemplate.findMany({
    select: {
      id: true, name: true, isBoss: true, isExpeditionMob: true, flavorAppearance: true, seasonId: true,
      season: { select: { id: true, name: true, startsAt: true } },
      zone: { select: { name: true } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const { matchedName, suggestions } = matchLookupName(query, templates.map((t) => t.name));
  if (!matchedName) {
    return { match: null, suggestions };
  }

  const normalizedMatch = normalizeLookupName(matchedName);
  const rows = templates.filter((t) => normalizeLookupName(t.name) === normalizedMatch);
  const activeId = rows.length > 1 ? await activeSeasonId() : null;
  const { scoped, season } = resolveSeasonScope(rows, activeId);
  const ids = scoped.map((row) => row.id);
  const primary = scoped[0]!;

  const zones = Array.from(new Set(scoped.map((row) => row.zone.name)));

  const dropRows = await prisma.dropTable.findMany({
    where: { mobTemplateId: { in: ids } },
    select: {
      dropChance: true, minQuantity: true, maxQuantity: true,
      itemTemplate: { select: { name: true, itemType: true, tier: true } },
    },
  });
  const drops = dropRows
    .map((row) => ({
      itemName: row.itemTemplate.name,
      itemType: row.itemTemplate.itemType,
      tier: row.itemTemplate.tier,
      dropRatePct: dropRatePct(row.dropChance),
      minQty: row.minQuantity,
      maxQty: row.maxQuantity,
    }))
    .sort((a, b) => b.dropRatePct - a.dropRatePct);

  return {
    suggestions: [],
    match: {
      name: primary.name,
      isBoss: primary.isBoss,
      isExpeditionMob: primary.isExpeditionMob,
      season,
      zones,
      flavorAppearance: primary.flavorAppearance,
      drops,
    },
  };
}

export async function lookupResourceForDiscord(query: string): Promise<ResourceLookupResult> {
  const nodes = await prisma.resourceNode.findMany({
    select: {
      id: true,
      resourceType: true,
      skillRequired: true,
      levelRequired: true,
      baseYield: true,
      discoveryChance: true,
      minCapacity: true,
      maxCapacity: true,
      zone: {
        select: {
          name: true,
          difficulty: true,
          seasonId: true,
          season: { select: { id: true, name: true, startsAt: true } },
        },
      },
    },
    orderBy: [{ resourceType: 'asc' }, { zoneId: 'asc' }],
  });

  const resourceNames = Array.from(
    new Map(nodes.map((node) => [normalizeLookupName(node.resourceType), node.resourceType])).values(),
  );
  const normalizedQuery = normalizeLookupName(query);
  if (!normalizedQuery) {
    return { match: null, suggestions: [] };
  }

  const exactNames = resourceNames.filter((name) => normalizeLookupName(name) === normalizedQuery);
  const containingNames = exactNames.length
    ? exactNames
    : resourceNames.filter((name) => normalizeLookupName(name).includes(normalizedQuery));

  if (!containingNames.length) {
    return {
      match: null,
      suggestions: matchLookupName(query, resourceNames).suggestions,
    };
  }

  const matchedNames = containingNames.sort((a, b) => {
    const aStarts = normalizeLookupName(a).startsWith(normalizedQuery);
    const bStarts = normalizeLookupName(b).startsWith(normalizedQuery);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;
    return a.localeCompare(b);
  });
  const matchedNameKeys = new Set(matchedNames.map((name) => normalizeLookupName(name)));
  const matchedNodes = nodes.filter((node) => matchedNameKeys.has(normalizeLookupName(node.resourceType)));

  const templates = await prisma.itemTemplate.findMany({
    where: {
      itemType: 'resource',
      name: { in: matchedNames },
    },
    select: {
      id: true,
      name: true,
      tier: true,
      seasonId: true,
      season: { select: { id: true, name: true, startsAt: true } },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  const hasSeasonalNodes = matchedNodes.some((node) => node.zone.seasonId !== null);
  const hasSeasonalTemplates = templates.some((template) => template.seasonId !== null);
  const activeId = hasSeasonalNodes || hasSeasonalTemplates
    ? await activeSeasonId()
    : null;

  const templatesByName = new Map<string, typeof templates>();
  for (const template of templates) {
    const key = normalizeLookupName(template.name);
    const grouped = templatesByName.get(key) ?? [];
    grouped.push(template);
    templatesByName.set(key, grouped);
  }

  const tierByName = new Map<string, number>();
  for (const [key, groupedTemplates] of templatesByName.entries()) {
    const { scoped } = resolveSeasonScope(groupedTemplates, activeId);
    const template = scoped[0];
    if (template) tierByName.set(key, template.tier);
  }

  const zonesByResource = new Map<string, ResourceZoneLookupData[]>();
  for (const name of matchedNames) {
    const key = normalizeLookupName(name);
    const scopedNodes = resolveResourceNodeScope(
      matchedNodes.filter((node) => normalizeLookupName(node.resourceType) === key),
      activeId,
    );
    for (const node of scopedNodes) {
      const zones = zonesByResource.get(key) ?? [];
      zones.push({
        name: node.zone.name,
        skillRequired: node.skillRequired,
        levelRequired: node.levelRequired,
        baseYield: node.baseYield,
        discoveryChancePct: percentFromRate(node.discoveryChance),
        minCapacity: node.minCapacity,
        maxCapacity: node.maxCapacity,
        difficulty: node.zone.difficulty,
      });
      zonesByResource.set(key, zones);
    }
  }

  return {
    suggestions: [],
    match: {
      query,
      resources: matchedNames.map((name) => {
        const key = normalizeLookupName(name);
        const zones = [...(zonesByResource.get(key) ?? [])]
          .sort((a, b) => a.difficulty - b.difficulty || a.name.localeCompare(b.name))
          .map((zone) => ({
            name: zone.name,
            skillRequired: zone.skillRequired,
            levelRequired: zone.levelRequired,
            baseYield: zone.baseYield,
            discoveryChancePct: zone.discoveryChancePct,
            minCapacity: zone.minCapacity,
            maxCapacity: zone.maxCapacity,
          }));

        return {
          name,
          tier: tierByName.get(key) ?? null,
          zones,
        };
      }),
    },
  };
}
