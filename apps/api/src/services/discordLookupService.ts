import { prisma } from '@pocketrealm/database';
import { SEASON_STATUSES, type ItemStats } from '@pocketrealm/shared';
import { matchLookupName, normalizeLookupName } from './discordLookupMatch';

export interface ItemCardData {
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  weightClass: string | null;
  setId: string | null;
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
  season: { name: string } | null;
  zones: string[];
  flavorAppearance: string | null;
  drops: Array<{ itemName: string; itemType: string; tier: number; dropRatePct: number; minQty: number; maxQty: number }>;
}

export interface ItemLookupResult { match: ItemCardData | null; suggestions: string[]; }
export interface MobLookupResult { match: MobCardData | null; suggestions: string[]; }

const STAT_ORDER: Array<keyof ItemStats> = [
  'attack', 'magicPower', 'rangedPower', 'accuracy', 'dodge', 'armor',
  'magicDefence', 'health', 'luck', 'critChance', 'critDamage', 'inventorySlots',
];

function dropRatePct(dropChance: unknown): number {
  return Math.round(Number(dropChance) * 10000) / 100;
}

interface SeasonRef { id: string; name: string; startsAt?: Date | string | null }
interface SeasonedRow { id: string; seasonId: string | null; season: SeasonRef | null }

async function activeSeasonId(): Promise<string | null> {
  const season = await prisma.season.findFirst({
    where: { status: SEASON_STATUSES.ACTIVE },
    select: { id: true, name: true },
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
    return { scoped, season: scoped[0]?.season ? { name: scoped[0].season!.name } : null };
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
  return { scoped, season: scoped[0]?.season ? { name: scoped[0].season!.name } : null };
}

export async function lookupItemForDiscord(query: string): Promise<ItemLookupResult> {
  const templates = await prisma.itemTemplate.findMany({
    select: {
      id: true, name: true, itemType: true, slot: true, tier: true, weightClass: true,
      setId: true, requiredSkill: true, requiredLevel: true, sellPrice: true,
      flavorText: true, baseStats: true, seasonId: true,
      season: { select: { id: true, name: true, startsAt: true } },
    },
  });

  const { matchedName, suggestions } = matchLookupName(query, templates.map((t) => t.name));
  if (!matchedName) {
    return { match: null, suggestions };
  }

  const normalizedMatch = normalizeLookupName(matchedName);
  const rows = templates.filter((t) => normalizeLookupName(t.name) === normalizedMatch);
  const { scoped, season } = resolveSeasonScope(rows, await activeSeasonId());
  const ids = scoped.map((row) => row.id);
  const primary = scoped[0]!;

  const dropRows = await prisma.dropTable.findMany({
    where: { itemTemplateId: { in: ids } },
    select: {
      dropChance: true, minQuantity: true, maxQuantity: true,
      mobTemplate: { select: { name: true, zone: { select: { name: true } } } },
    },
  });
  const drops = dropRows
    .map((row) => ({
      mobName: row.mobTemplate.name,
      zoneName: row.mobTemplate.zone.name,
      dropRatePct: dropRatePct(row.dropChance),
      minQty: row.minQuantity,
      maxQty: row.maxQuantity,
    }))
    .sort((a, b) => b.dropRatePct - a.dropRatePct);

  const recipe = await prisma.craftingRecipe.findFirst({
    where: { resultTemplateId: { in: ids } },
    select: { skillType: true, requiredLevel: true, turnCost: true, xpReward: true, materials: true },
  });

  let craft: ItemCardData['sources']['craft'] = null;
  if (recipe) {
    const materialList = Array.isArray(recipe.materials)
      ? (recipe.materials as Array<{ itemTemplateId: string; quantity: number }>)
      : [];
    const matTemplates = materialList.length
      ? await prisma.itemTemplate.findMany({
          where: { id: { in: materialList.map((m) => m.itemTemplateId) } },
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
        name: nameById.get(m.itemTemplateId) ?? 'Unknown material',
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
      setId: primary.setId,
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
      id: true, name: true, isBoss: true, flavorAppearance: true, seasonId: true,
      season: { select: { id: true, name: true, startsAt: true } },
      zone: { select: { name: true } },
    },
  });

  const { matchedName, suggestions } = matchLookupName(query, templates.map((t) => t.name));
  if (!matchedName) {
    return { match: null, suggestions };
  }

  const normalizedMatch = normalizeLookupName(matchedName);
  const rows = templates.filter((t) => normalizeLookupName(t.name) === normalizedMatch);
  const { scoped, season } = resolveSeasonScope(rows, await activeSeasonId());
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
      season,
      zones,
      flavorAppearance: primary.flavorAppearance,
      drops,
    },
  };
}
