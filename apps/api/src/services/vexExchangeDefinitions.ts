import type { ItemStats, VexExchangeCategory, VexExchangePreview } from '@pocketrealm/shared';

export type VexAugmentType = 'durability_reinforcement' | 'boss_stone';

export type VexExchangeEffect =
  | { type: 'create_item'; itemTemplateName: string; soulbound: boolean }
  | { type: 'transform_item'; fromTemplateName: string; toTemplateName: string; soulbound: boolean }
  | { type: 'reinforce_durability'; augmentType: 'durability_reinforcement'; bonusPercent: number }
  | { type: 'apply_bonus_stats'; augmentType: 'boss_stone'; eligibleTemplateNames: string[]; bonusStats: ItemStats };

export type VexTargetRule =
  | { type: 'none' }
  | {
      type: 'equipment';
      itemTypes: Array<'weapon' | 'armor'>;
      augmentType: VexAugmentType;
      minTier: number;
      maxTier: number;
    }
  | { type: 'template'; templateNames: string[]; augmentType?: VexAugmentType };

export interface VexExchangeDefinition {
  key: string;
  name: string;
  description: string;
  preview: VexExchangePreview;
  category: VexExchangeCategory;
  goldCost: number;
  requiredItems: Array<{ itemTemplateName: string; quantity: number }>;
  targetRule: VexTargetRule;
  effect: VexExchangeEffect;
  sortOrder: number;
}

export const VEX_EXCHANGES: VexExchangeDefinition[] = [
  {
    key: 'wayfarer_aegis',
    name: 'Wayfarer Aegis',
    description: 'Trade Alpha Wolf trophies for an accuracy off-hand inspired by the old Wayfinder Buckler.',
    preview: {
      summary: 'Creates a soulbound tier 2 off-hand shield.',
      details: [
        'Accuracy +10, Armor +4, Health +8',
        'Required level 8',
        'Max durability 100',
        'Does not require the original Wayfinder Buckler.',
      ],
    },
    category: 'item',
    goldCost: 750,
    requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 4 }],
    targetRule: { type: 'none' },
    effect: { type: 'create_item', itemTemplateName: 'Wayfarer Aegis', soulbound: true },
    sortOrder: 10,
  },
  {
    key: 'spiritbound_aegis',
    name: 'Spiritbound Aegis',
    description: 'Upgrade a Wayfarer Aegis with Spirit Essence. The old shield becomes the new one.',
    preview: {
      summary: 'Transforms a Wayfarer Aegis into a stronger tier 4 off-hand.',
      details: [
        'Accuracy +14, Armor +5, Magic Defence +8, Health +12',
        'Required level 16',
        'Max durability 140',
        'Consumes the selected Wayfarer Aegis.',
      ],
    },
    category: 'upgrade',
    goldCost: 2500,
    requiredItems: [{ itemTemplateName: 'Spirit Essence', quantity: 6 }],
    targetRule: { type: 'template', templateNames: ['Wayfarer Aegis'] },
    effect: {
      type: 'transform_item',
      fromTemplateName: 'Wayfarer Aegis',
      toTemplateName: 'Spiritbound Aegis',
      soulbound: true,
    },
    sortOrder: 20,
  },
  {
    key: 'vex_temper_tier_1_3',
    name: 'Vex Temper',
    description: 'Restore and reinforce a tier 1-3 weapon or armor item. Each item can be tempered once.',
    preview: {
      summary: 'Permanently restores and raises max durability by 20%.',
      details: [
        'Works on tier 1-3 weapons and armor.',
        'Can only be applied once per item.',
        'Repairs the item to its new maximum durability.',
      ],
    },
    category: 'service',
    goldCost: 1000,
    requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 2 }],
    targetRule: {
      type: 'equipment',
      itemTypes: ['weapon', 'armor'],
      augmentType: 'durability_reinforcement',
      minTier: 1,
      maxTier: 3,
    },
    effect: { type: 'reinforce_durability', augmentType: 'durability_reinforcement', bonusPercent: 0.2 },
    sortOrder: 30,
  },
  {
    key: 'vex_temper_tier_4_5',
    name: 'Vex Temper',
    description: 'Restore and reinforce a tier 4-5 weapon or armor item. Each item can be tempered once.',
    preview: {
      summary: 'Permanently restores and raises max durability by 20%.',
      details: [
        'Works on tier 4-5 weapons and armor.',
        'Can only be applied once per item.',
        'Repairs the item to its new maximum durability.',
      ],
    },
    category: 'service',
    goldCost: 3000,
    requiredItems: [{ itemTemplateName: 'Spirit Essence', quantity: 2 }],
    targetRule: {
      type: 'equipment',
      itemTypes: ['weapon', 'armor'],
      augmentType: 'durability_reinforcement',
      minTier: 4,
      maxTier: 5,
    },
    effect: { type: 'reinforce_durability', augmentType: 'durability_reinforcement', bonusPercent: 0.2 },
    sortOrder: 40,
  },
  {
    key: 'fangstone',
    name: 'Fangstone',
    description: 'Set Alpha Wolf pressure into a boss-crafted item. Each item can hold one boss stone.',
    preview: {
      summary: 'Adds a one-time Alpha Wolf boss stone to eligible boss-crafted gear.',
      details: [
        'Attack +2, Accuracy +2, Armor +1, Health +3',
        'Works on Wolfsbane Blade and Alpha Pelt Chest.',
        'Each item can hold one boss stone.',
      ],
    },
    category: 'boss_stone',
    goldCost: 1500,
    requiredItems: [{ itemTemplateName: 'Alpha Wolf Fang', quantity: 3 }],
    targetRule: { type: 'template', templateNames: ['Wolfsbane Blade', 'Alpha Pelt Chest'], augmentType: 'boss_stone' },
    effect: {
      type: 'apply_bonus_stats',
      augmentType: 'boss_stone',
      eligibleTemplateNames: ['Wolfsbane Blade', 'Alpha Pelt Chest'],
      bonusStats: { attack: 2, accuracy: 2, armor: 1, health: 3 },
    },
    sortOrder: 50,
  },
  {
    key: 'spiritstone',
    name: 'Spiritstone',
    description: 'Bind Spirit Essence into a boss-crafted item. Each item can hold one boss stone.',
    preview: {
      summary: 'Adds a one-time Spirit boss stone to eligible boss-crafted gear.',
      details: [
        'Magic Power +3, Accuracy +2, Magic Defence +2, Health +4',
        'Works on Spirit Staff and Ethereal Robes.',
        'Each item can hold one boss stone.',
      ],
    },
    category: 'boss_stone',
    goldCost: 3500,
    requiredItems: [{ itemTemplateName: 'Spirit Essence', quantity: 3 }],
    targetRule: { type: 'template', templateNames: ['Spirit Staff', 'Ethereal Robes'], augmentType: 'boss_stone' },
    effect: {
      type: 'apply_bonus_stats',
      augmentType: 'boss_stone',
      eligibleTemplateNames: ['Spirit Staff', 'Ethereal Robes'],
      bonusStats: { magicPower: 3, accuracy: 2, magicDefence: 2, health: 4 },
    },
    sortOrder: 60,
  },
];
