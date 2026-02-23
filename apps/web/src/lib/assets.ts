function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export type UiIconName =
  | 'attack'
  | 'explore'
  | 'gold'
  | 'guild'
  | 'hp'
  | 'inventory'
  | 'rest'
  | 'scroll'
  | 'settings'
  | 'turn'
  | 'xp';

export function uiIconSrc(name: UiIconName): string {
  return `/assets/ui/ui_${name}-pixelated-128.png`;
}

export function skillIconSrc(skillType: string): string {
  return `/assets/skills/skill_${skillType}-pixelated-128.png`;
}

export function zoneImageSrc(zoneName: string): string {
  const key = slugify(zoneName);
  return `/assets/zones/zone_${key}.png`;
}

export function resourceImageSrc(resourceType: string): string {
  const key = slugify(resourceType);
  return `/assets/resources/resource_${key}-pixelated-128.png`;
}

const itemNameOverrides: Record<string, string> = {
  // Seeded / common names that don't have 1:1 assets
  'leather_cap': 'iron_helmet',
};

export function itemImageSrc(itemName: string, itemType: string): string {
  const keyRaw = slugify(itemName);
  const key = itemNameOverrides[keyRaw] ?? keyRaw;

  if (itemType === 'resource') {
    return `/assets/resources/resource_${key}-pixelated-128.png`;
  }

  if (itemType === 'consumable') {
    return `/assets/consumables/consumable_${key}-pixelated-128.png`;
  }

  // weapon/armor + other equipables
  return `/assets/items/item_${key}-pixelated-128.png`;
}

export function monsterImageSrc(monsterName: string): string {
  const key = slugify(monsterName);
  return `/assets/monsters/monster_${key}-pixelated-128.png`;
}
