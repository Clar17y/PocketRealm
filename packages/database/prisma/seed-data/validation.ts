import type { ItemTemplate } from '@pocketrealm/shared';

type ItemTemplateLike = Pick<ItemTemplate, 'name' | 'itemType' | 'requiredSkill' | 'baseStats'>;

export const SUPPORTED_ITEM_STAT_KEYS = new Set([
  'accuracy',
  'armor',
  'attack',
  'critChance',
  'critDamage',
  'dodge',
  'health',
  'inventorySlots',
  'luck',
  'magicDefence',
  'magicPower',
  'rangedPower',
]);

export const STARTER_TARGETS = {
  tutorialHitChanceMin: 0.28,
  forestEdgeTier1HitChanceMin: 0.25,
  tutorialEnemyHitChanceMin: 0.35,
} as const;

export const PVP_TARGETS = {
  uncheckedDodgeHitChanceMax: 0.25,
  counterBuildHitChanceMin: 0.45,
} as const;

export const EXPEDITION_TARGETS = {
  dodgeTankDirectHitChanceMin: 0.5,
  dodgeTankDirectHitChanceMax: 0.6,
  bossPressureHitChanceMin: 0.65,
} as const;

export function getUnsupportedStatKeys(stats: Record<string, number> | null | undefined): string[] {
  return Object.keys(stats ?? {}).filter((key) => !SUPPORTED_ITEM_STAT_KEYS.has(key));
}

export function validateWeaponTemplate(template: ItemTemplateLike): string[] {
  if (template.itemType !== 'weapon') {
    return [];
  }

  if (template.requiredSkill === 'ranged' && (template.baseStats?.rangedPower ?? 0) <= 0) {
    return ['ranged weapon missing rangedPower'];
  }

  return [];
}

export function validateItemTemplate(template: ItemTemplateLike): string[] {
  const unsupportedKeys = getUnsupportedStatKeys(template.baseStats);
  const errors = unsupportedKeys.length > 0
    ? [`unsupported stat keys: ${unsupportedKeys.join(', ')}`]
    : [];

  return [...errors, ...validateWeaponTemplate(template)];
}

export function validateItemTemplates(templates: ItemTemplateLike[]) {
  return templates
    .map((template) => ({
      name: template.name,
      errors: validateItemTemplate(template),
    }))
    .filter((template) => template.errors.length > 0);
}
