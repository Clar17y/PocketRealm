import { GUILD_MATERIAL_CATEGORIES } from '../constants/gameConstants';

const GUILD_TO_GATHERING_CATEGORY: Readonly<Record<string, string>> = {
  ore: 'ore',
  log: 'wood',
  herb: 'herb',
};

const TOKEN_TO_GATHERING_CATEGORY: Readonly<Record<string, string>> = {
  ore: 'ore',
  sandstone: 'ore',
  log: 'wood',
  wood: 'wood',
  herb: 'herb',
  sage: 'herb',
  moonpetal: 'herb',
  moss: 'herb',
  starbloom: 'herb',
  mushroom: 'herb',
  windbloom: 'herb',
  gravemoss: 'herb',
  fern: 'herb',
  kelp: 'herb',
  resin: 'resin',
  seed: 'seed',
  root: 'root',
  gem: 'gem',
};

export function getGatheringResourceCategory(resourceType: string): string {
  const normalized = normalizeResourceType(resourceType);
  for (const [guildCategory, resourceNames] of Object.entries(GUILD_MATERIAL_CATEGORIES)) {
    const gatheringCategory = GUILD_TO_GATHERING_CATEGORY[guildCategory];
    if (!gatheringCategory) continue;
    if (resourceNames.some((name) => normalizeResourceType(name) === normalized)) {
      return gatheringCategory;
    }
  }

  const parts = normalized.split(' ').filter(Boolean);
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const category = TOKEN_TO_GATHERING_CATEGORY[parts[index]!];
    if (category) return category;
  }

  return parts.at(-1) ?? normalized;
}

export function getResourceTypesForGatheringCategory(category: string): string[] {
  const normalizedCategory = normalizeResourceType(category);
  const resourceTypes: string[] = [];

  for (const [guildCategory, resourceNames] of Object.entries(GUILD_MATERIAL_CATEGORIES)) {
    if (GUILD_TO_GATHERING_CATEGORY[guildCategory] === normalizedCategory) {
      resourceTypes.push(...resourceNames);
    }
  }

  return [...new Set(resourceTypes)].sort((a, b) => a.localeCompare(b));
}

export function normalizeResourceType(resourceType: string): string {
  return resourceType.trim().toLowerCase().replace(/[_\s]+/g, ' ');
}
