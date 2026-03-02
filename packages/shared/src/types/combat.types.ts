import type { ItemRarity } from './item.types';

export type DamageType = 'physical' | 'magic';

export interface MobTemplate {
  id: string;
  name: string;
  zoneId: string;
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
  spellPattern: SpellAction[];
  damageType: DamageType;
}

export interface SpellEffect {
  stat: string;
  modifier: number;
  duration: number;
}

export interface SpellAction {
  round: number;
  name: string;
  damage?: number;
  heal?: number;
  effects?: SpellEffect[];
}

export type CombatActor = 'combatantA' | 'combatantB';

export interface Combatant {
  id: string;
  name: string;
  stats: CombatantStats;
  spells?: SpellAction[];
}

export interface ActiveEffect {
  name: string;
  target: CombatActor;
  stat: string;
  modifier: number;
  remainingRounds: number;
}

export interface CombatState {
  combatantAHp: number;
  combatantAMaxHp: number;
  combatantBHp: number;
  combatantBMaxHp: number;
  round: number;
  log: CombatLogEntry[];
  outcome: CombatOutcome | null;
  activeEffects: ActiveEffect[];
}

export interface CombatLogEntry {
  round: number;
  actor: CombatActor;
  actorName: string;
  action: CombatAction;
  roll?: number;
  damage?: number;
  blocked?: number;
  evaded?: boolean;
  message: string;
  attackModifier?: number;
  accuracyModifier?: number;
  targetDodge?: number;
  targetEvasion?: number;
  targetDefence?: number;
  targetMagicDefence?: number;
  rawDamage?: number;
  armorReduction?: number;
  magicDefenceReduction?: number;
  isCritical?: boolean;
  critMultiplier?: number;
  combatantAHpAfter?: number;
  combatantBHpAfter?: number;
  spellName?: string;
  healAmount?: number;
  effectsApplied?: Array<{
    stat: string;
    modifier: number;
    duration: number;
    target: CombatActor;
  }>;
  effectsExpired?: Array<{
    name: string;
    target: CombatActor;
  }>;
}

export type CombatAction = 'attack' | 'spell' | 'defend' | 'flee' | 'potion';

export type CombatOutcome = 'victory' | 'defeat' | 'fled' | 'draw';

export interface CombatResult {
  outcome: CombatOutcome;
  log: CombatLogEntry[];
  combatantAMaxHp: number;
  combatantBMaxHp: number;
  combatantAHpRemaining: number;
  combatantBHpRemaining: number;
  potionsConsumed: PotionConsumed[];
}

export interface LootDrop {
  itemTemplateId: string;
  quantity: number;
  rarity?: ItemRarity;
}

export interface DurabilityLoss {
  itemId: string;
  amount: number;
  itemName?: string;
  newDurability?: number;
  maxDurability?: number;
  /** True only on the transition to 0 (not every combat while already broken) */
  isBroken?: boolean;
  /** True only when crossing below the warning threshold this tick */
  crossedWarningThreshold?: boolean;
}

export interface CombatPotion {
  name: string;
  healAmount: number;
  templateId: string;
  potionType: 'hp' | 'stamina' | 'mana';
}

export interface CombatOptions {
  autoPotionThreshold?: number;
  potions?: CombatPotion[];
}

export interface PotionConsumed {
  templateId: string;
  name: string;
  healAmount: number;
  round: number;
}

export interface CombatantStats {
  hp: number;
  maxHp: number;
  attack: number;
  accuracy: number;
  defence: number;
  magicDefence: number;
  dodge: number;
  evasion: number;
  damageMin: number;
  damageMax: number;
  speed: number;
  critChance?: number;
  critDamage?: number;
  damageType: DamageType;
}
