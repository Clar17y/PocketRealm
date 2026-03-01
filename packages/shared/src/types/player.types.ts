export interface Player {
  id: string;
  username: string;
  email: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  characterXp: number;
  characterLevel: number;
  attributePoints: number;
  attributes: PlayerAttributes;
  gold: number;
}

export interface TurnBank {
  playerId: string;
  currentTurns: number;
  lastRegenAt: Date;
}

export interface PlayerSkill {
  id: string;
  playerId: string;
  skillType: SkillType;
  level: number;
  xp: number;
  dailyXpGained: number;
  lastXpResetAt: Date;
}

export interface PlayerAttributes {
  vitality: number;
  strength: number;
  dexterity: number;
  intelligence: number;
  luck: number;
  evasion: number;
}

export type AttributeType = keyof PlayerAttributes;

export const ATTRIBUTE_TYPES: AttributeType[] = [
  'vitality',
  'strength',
  'dexterity',
  'intelligence',
  'luck',
  'evasion',
];

export const DEFAULT_PLAYER_ATTRIBUTES: PlayerAttributes = {
  vitality: 0,
  strength: 0,
  dexterity: 0,
  intelligence: 0,
  luck: 0,
  evasion: 0,
};

export type SkillType =
  | 'melee'
  | 'ranged'
  | 'magic'
  | 'mining'
  | 'foraging'
  | 'woodcutting'
  | 'refining'
  | 'tanning'
  | 'weaving'
  | 'weaponsmithing'
  | 'armorsmithing'
  | 'leatherworking'
  | 'tailoring'
  | 'alchemy'
  | 'jewelcrafting';

export const COMBAT_SKILLS: SkillType[] = ['melee', 'ranged', 'magic'];
export const GATHERING_SKILLS: SkillType[] = ['mining', 'foraging', 'woodcutting'];
export const PROCESSING_SKILLS: SkillType[] = ['refining', 'tanning', 'weaving'];
export const CRAFTING_SKILLS: SkillType[] = ['weaponsmithing', 'armorsmithing', 'leatherworking', 'tailoring', 'alchemy', 'jewelcrafting'];
export const ALL_SKILLS: SkillType[] = [
  ...COMBAT_SKILLS,
  ...GATHERING_SKILLS,
  ...PROCESSING_SKILLS,
  ...CRAFTING_SKILLS,
];

export interface PlayerEquipment {
  playerId: string;
  slot: EquipmentSlot;
  itemId: string | null;
}

export type EquipmentSlot =
  | 'head'
  | 'neck'
  | 'chest'
  | 'gloves'
  | 'belt'
  | 'legs'
  | 'boots'
  | 'main_hand'
  | 'off_hand'
  | 'ring'
  | 'charm'
  | 'backpack';

export const ALL_EQUIPMENT_SLOTS: EquipmentSlot[] = [
  'head',
  'neck',
  'chest',
  'gloves',
  'belt',
  'legs',
  'boots',
  'main_hand',
  'off_hand',
  'ring',
  'charm',
  'backpack',
];
