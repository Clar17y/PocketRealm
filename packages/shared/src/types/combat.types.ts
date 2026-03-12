import type { ItemRarity } from './item.types';

export type DamageType = 'physical' | 'magic';

export type CombatMode = 'pvp' | 'pve_open_world' | 'pve_expedition' | 'pve_boss';

export interface HitCurveConfig {
  minHitChance: number;
  maxHitChance: number;
  bias: number;
  exponent: number;
}

export interface HitScoreBreakdown {
  hitScore: number;
  avoidScore: number;
  hitChance: number;
}

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

export interface ActiveEffect {
  name: string;
  target: CombatActor;
  stat: string;
  modifier: number;
  remainingRounds: number;
  /** Snapshotted flat DOT damage per round (resolved from flat + % at application time) */
  resolvedDamagePerRound?: number;
  /** Which defence reduces DOT ticks */
  dotDamageType?: 'physical' | 'magic';
  /** Snapshotted HOT healing per round */
  resolvedHealPerRound?: number;
  /** Which combat skill applied this effect (for XP attribution of DOT ticks) */
  sourceScalingStat?: 'melee' | 'ranged' | 'magic';
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
  hitChance?: number;
  hitRollValue?: number;
  attackerHitScore?: number;
  defenderAvoidScore?: number;
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
  healResourceType?: 'hp' | 'stamina' | 'mana';
  leechHeal?: number;
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
  effectsCleansed?: Array<{
    name: string;
    target: CombatActor;
    stacksRemoved: number;
  }>;
}

export type CombatAction = 'attack' | 'spell' | 'defend' | 'counter' | 'ward' | 'flee' | 'potion' | 'cleanse' | 'heal' | 'regen';

export type CombatOutcome = 'victory' | 'defeat' | 'fled' | 'draw';

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
  /** Heal/restore amount for resource potions; 0 for cleanse/buff potions */
  healAmount: number;
  templateId: string;
  potionType: 'hp' | 'stamina' | 'mana' | 'cleanse' | 'buff_attack' | 'buff_defence';
  /** Duration in rounds (buff potions only) */
  buffDuration?: number;
  /** Buff value — percent for buff_attack, flat for buff_defence */
  buffValue?: number;
}

export interface CombatOptions {
  potions?: CombatPotion[];
  combatMode?: CombatMode;
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
