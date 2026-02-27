import { describe, expect, it } from 'vitest';
import {
  uiIconSrc,
  skillIconSrc,
  zoneImageSrc,
  resourceImageSrc,
  itemImageSrc,
  monsterImageSrc,
  screenBackgroundSrc,
} from './assets';

describe('uiIconSrc', () => {
  it('returns correct path', () => {
    expect(uiIconSrc('attack')).toBe('/assets/ui/ui_attack-pixelated-128.webp');
    expect(uiIconSrc('gold')).toBe('/assets/ui/ui_gold-pixelated-128.webp');
  });
});

describe('skillIconSrc', () => {
  it('returns correct path for skill type', () => {
    expect(skillIconSrc('melee')).toBe('/assets/skills/skill_melee-pixelated-128.webp');
    expect(skillIconSrc('mining')).toBe('/assets/skills/skill_mining-pixelated-128.webp');
  });
});

describe('zoneImageSrc', () => {
  it('slugifies zone name', () => {
    expect(zoneImageSrc('Dark Forest')).toBe('/assets/zones/zone_dark_forest.webp');
  });

  it('handles special characters', () => {
    expect(zoneImageSrc("Dragon's Lair")).toBe('/assets/zones/zone_dragons_lair.webp');
  });
});

describe('resourceImageSrc', () => {
  it('returns correct resource path', () => {
    expect(resourceImageSrc('Iron Ore')).toBe('/assets/resources/resource_iron_ore-pixelated-128.webp');
  });
});

describe('itemImageSrc', () => {
  it('routes weapon/armor to items path', () => {
    expect(itemImageSrc('Iron Sword', 'weapon')).toBe('/assets/items/item_iron_sword-pixelated-128.webp');
  });

  it('routes resource to resources path', () => {
    expect(itemImageSrc('Iron Ore', 'resource')).toBe('/assets/resources/resource_iron_ore-pixelated-128.webp');
  });

  it('routes consumable to consumables path', () => {
    expect(itemImageSrc('Health Potion', 'consumable')).toBe('/assets/consumables/consumable_health_potion-pixelated-128.webp');
  });

  it('applies name overrides', () => {
    expect(itemImageSrc('Leather Cap', 'armor')).toBe('/assets/items/item_iron_helmet-pixelated-128.webp');
  });

  it('resolves wooden sword to its own asset', () => {
    expect(itemImageSrc('Wooden Sword', 'weapon')).toBe('/assets/items/item_wooden_sword-pixelated-128.webp');
  });

  it('handles apostrophes in names', () => {
    expect(itemImageSrc("King's Blade", 'weapon')).toBe('/assets/items/item_kings_blade-pixelated-128.webp');
  });
});

describe('monsterImageSrc', () => {
  it('slugifies monster name', () => {
    expect(monsterImageSrc('Forest Spider')).toBe('/assets/monsters/monster_forest_spider-pixelated-128.webp');
  });
});

describe('screenBackgroundSrc', () => {
  it('returns arena background', () => {
    expect(screenBackgroundSrc('arena')).toBe('/assets/screens/screen_arena.webp');
  });

  it('returns forge background', () => {
    expect(screenBackgroundSrc('forge')).toBe('/assets/screens/screen_forge.webp');
  });

  it('returns guild background', () => {
    expect(screenBackgroundSrc('guild')).toBe('/assets/screens/screen_guild.webp');
  });

  it('returns equipment background', () => {
    expect(screenBackgroundSrc('equipment')).toBe('/assets/screens/screen_equipment.webp');
  });

  it('returns inventory background', () => {
    expect(screenBackgroundSrc('inventory')).toBe('/assets/screens/screen_inventory.webp');
  });

  it('returns crafting background for active skill', () => {
    expect(screenBackgroundSrc('crafting', 'weaponsmithing')).toBe('/assets/screens/screen_weaponsmithing.webp');
    expect(screenBackgroundSrc('crafting', 'alchemy')).toBe('/assets/screens/screen_alchemy.webp');
    expect(screenBackgroundSrc('crafting', 'jewelcrafting')).toBe('/assets/screens/screen_jewelcrafting.webp');
  });

  it('returns undefined for screens without specific backgrounds', () => {
    expect(screenBackgroundSrc('skills')).toBeUndefined();
    expect(screenBackgroundSrc('bestiary')).toBeUndefined();
    expect(screenBackgroundSrc('zones')).toBeUndefined();
    expect(screenBackgroundSrc('settings')).toBeUndefined();
  });

  it('returns undefined for zone-art screens (handled separately)', () => {
    expect(screenBackgroundSrc('explore')).toBeUndefined();
    expect(screenBackgroundSrc('combat')).toBeUndefined();
    expect(screenBackgroundSrc('home')).toBeUndefined();
    expect(screenBackgroundSrc('gathering')).toBeUndefined();
    expect(screenBackgroundSrc('rest')).toBeUndefined();
  });
});
