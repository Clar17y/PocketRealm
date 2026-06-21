// --- Action Categories ---
export type ActionCategory = 'offensive' | 'supportive' | 'defensive';

// --- Specific Action Types ---
export type OffensiveAction =
  | 'light_attack'
  | 'normal_attack'
  | 'heavy_attack'
  | 'skill_attack'
  | 'damage_spell'
  | 'debuff_spell';

export type SupportiveAction =
  | 'buff'
  | 'heal_self'
  | 'heal_ally'
  | 'taunt'
  | 'use_potion'
  | 'use_cleanse_potion'
  | 'use_buff_potion';

export type DefensiveAction =
  | 'defend'
  | 'counter'
  | 'ward';

export type CombatActionType = OffensiveAction | SupportiveAction | DefensiveAction;

export type ScalingStat = 'melee' | 'ranged' | 'magic' | 'weapon';

export interface PerActionScaling {
  skillLevels: { melee: number; ranged: number; magic: number };
  attributes: { strength: number; dexterity: number; intelligence: number };
  weaponPower: { attack: number; rangedPower: number; magicPower: number };
  equipmentAccuracy: number;
  weaponRequiredSkill: 'melee' | 'ranged' | 'magic' | null;
  /** Guild damage multiplier (e.g. 0.05 = +5% damage). Applied to per-action damage. */
  guildDamageMultiplier?: number;
}

// --- Action Definition ---
export interface ActionCost {
  stamina: number;
  mana: number;
}

export type ActionTargetMode = 'single_target' | 'aoe';

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  actionType: CombatActionType;
  category: ActionCategory;
  cost: ActionCost;
  /** Whether the action resolves against one target or all valid targets. */
  targetMode?: ActionTargetMode;
  /** Damage multiplier relative to base weapon damage (1.0 = normal) */
  damageMultiplier?: number;
  /** Accuracy modifier added to hit roll */
  accuracyModifier?: number;
  /** Defence reduction applied to target receiving this action */
  defenceReduction?: number;
  /** Damage reduction percentage when defending (0-1) */
  damageReductionPercent?: number;
  /** Whether this action guarantees avoidance of physical attacks */
  avoidsPhysical?: boolean;
  /** Whether this action guarantees resistance to magical attacks */
  resistsMagic?: boolean;
  /** Whether this action bypasses hit resolution entirely */
  alwaysHits?: boolean;
  /** Buff/debuff effect applied */
  effect?: ActionEffect;
  /** Heal amount (flat + percent of max HP) */
  healFlat?: number;
  healPercent?: number;
  /** Damage type override (e.g., spells that deal magic damage) */
  damageType?: 'physical' | 'magic';
  /** Whether this action makes the user "channeling" (vulnerable to bonus damage) */
  isChanneling?: boolean;
  /** Bonus damage multiplier when hitting a channeling target */
  bonusVsChanneling?: number;
  /** Number of rounds this ability forces boss to target the user (taunt) */
  tauntDuration?: number;
  /** Potion type consumed */
  potionType?: 'hp' | 'stamina' | 'mana' | 'cleanse' | 'buff_attack' | 'buff_defence';
  /** Which skill/attribute/weapon stat drives this action's damage.
   * 'weapon' = resolved from equipped weapon's requiredSkill at combat time.
   * Defaults to 'weapon' if omitted. */
  scalingStat?: ScalingStat;
  /** Heal attacker for this % of actual damage dealt (after defence) */
  lifeLeechPercent?: number;
}

export interface ActionEffect {
  name: string;
  /** Stat modified (e.g., 'attack', 'defence', 'accuracy', 'dodge') */
  stat: string;
  /** Flat modifier applied to the stat */
  modifier: number;
  /** Duration in rounds */
  duration: number;
  /** Whether this is a debuff applied to the target (vs buff on self) */
  isDebuff?: boolean;
  /** Whether this effect bypasses application hit/evasion checks */
  alwaysApplies?: boolean;
  /** Whether this is a DoT/HoT */
  damagePerRound?: number;
  healPerRound?: number;
  /** % of triggering hit's final damage added to DOT (snapshotted at application) */
  damagePerRoundPercent?: number;
  /** Which defence stat reduces DOT ticks */
  dotDamageType?: 'physical' | 'magic';
}

// --- Condition Types ---

export type ConditionType =
  | 'resource_below'
  | 'resource_above'
  | 'has_buff'
  | 'has_debuff'
  | 'no_buff'
  | 'no_debuff'
  | 'any_debuff'
  | 'any_magic_dot';

export type ConditionResourceType = 'hp' | 'stamina' | 'mana';

export interface SlotCondition {
  type: ConditionType;
  /** Required for resource_below/resource_above */
  resource?: ConditionResourceType;
  /** 0-100, required for resource_below/resource_above */
  threshold?: number;
  /** Required for buff/debuff conditions */
  effectName?: string;
}

// --- Combat Template ---

export interface CombatTemplateSlotData {
  id: string;
  sortOrder: number;
  /** Default/else action */
  actionId: string;
  /** Optional if/then condition */
  condition?: SlotCondition;
  /** Action when condition is true */
  thenActionId?: string;
}

export interface CombatTemplateData {
  id: string;
  playerId: string;
  name: string;
  isActive: boolean;
  slots: CombatTemplateSlotData[];
  createdAt: string;
  updatedAt: string;
}

// --- Resource State ---
export interface ResourceState {
  current: number;
  max: number;
  regenPerRound: number;
  regenPerSecond: number;
  restHealPerTurn: number;
}

// --- Skill Points ---
export type TalentTree = 'melee' | 'ranged' | 'magic' | 'survival';

export interface TalentNodeDefinition {
  id: string;
  tree: TalentTree;
  tier: number;
  name: string;
  description: string;
  pointCost: number;
  /** Minimum skill level required (e.g., melee level 25) */
  skillLevelGate?: { skill: string; level: number };
  /** Node IDs that must be unlocked first */
  prerequisites: string[];
  /** If this node unlocks a combat action, reference the ActionDefinition ID */
  unlocksAction?: string;
  /** If this node grants a passive bonus */
  passiveBonus?: PassiveBonus;
}

export interface PassiveBonus {
  stat: string;
  value: number;
  isPercent?: boolean;
  description: string;
}

export interface SkillPointAllocationData {
  playerId: string;
  totalPointsEarned: number;
  totalPointsSpent: number;
  availablePoints: number;
  allocations: Record<string, number>;
  unlockedActions: string[];
}
