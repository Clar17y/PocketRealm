/**
 * Central game constants - all tunable values in one place.
 * Change these to adjust game balance without touching logic.
 */

// =============================================================================
// TURN ECONOMY
// =============================================================================

export const TURN_CONSTANTS = {
  /** Turns regenerated per second */
  REGEN_RATE: 1,

  /** Maximum turns that can be banked (18 hours) */
  BANK_CAP: 64_800,

  /** Starting turns for new players (24 hours) */
  STARTING_TURNS: 86_400,
} as const;

// =============================================================================
// COMBAT
// =============================================================================

export const COMBAT_CONSTANTS = {
  /** Base chance to hit (before modifiers) */
  BASE_HIT_CHANCE: 0.7,

  /** Critical hit chance */
  CRIT_CHANCE: 0.05,

  /** Critical hit damage multiplier */
  CRIT_MULTIPLIER: 1.5,

  /** Minimum damage that can be dealt (after armor) */
  MIN_DAMAGE: 1,

  /** Turn cost for a single encounter */
  ENCOUNTER_TURN_COST: 50,
} as const;

export const CRIT_STAT_CONSTANTS = {
  FIXED_RANGE_BONUS_STATS: {
    critChance: { min: 0.03, max: 0.05 },
    critDamage: { min: 0.10, max: 0.20 },
  },
} as const;

export const SLOT_STAT_POOLS: Record<string, { primary: string[]; utility: string[] }> = {
  main_hand: { primary: ['attack', 'magicPower', 'rangedPower', 'critChance', 'critDamage'], utility: ['accuracy', 'luck'] },
  off_hand: { primary: ['armor', 'magicDefence', 'dodge'], utility: ['health', 'luck'] },
  head: { primary: ['armor', 'magicDefence', 'health'], utility: ['accuracy', 'luck'] },
  chest: { primary: ['armor', 'magicDefence', 'health'], utility: ['luck'] },
  legs: { primary: ['armor', 'magicDefence', 'health'], utility: ['dodge', 'luck'] },
  boots: { primary: ['dodge', 'armor', 'magicDefence'], utility: ['luck'] },
  gloves: { primary: ['critChance', 'accuracy', 'critDamage'], utility: ['attack', 'luck'] },
  neck: { primary: ['health', 'luck'], utility: ['accuracy'] },
  belt: { primary: ['armor', 'magicDefence', 'health'], utility: ['luck'] },
  ring: { primary: ['luck', 'accuracy', 'critChance', 'critDamage'], utility: ['dodge'] },
  charm: { primary: ['luck', 'accuracy', 'dodge', 'critChance', 'critDamage'], utility: ['health'] },
};

// =============================================================================
// SKILLS & XP
// =============================================================================

export const SKILL_CONSTANTS = {
  /** Base XP needed for level 2 */
  XP_BASE: 100,

  /** Exponent for XP curve: xp_for_level = base * (level ^ exponent) */
  XP_EXPONENT: 1.5,

  /** Maximum level */
  MAX_LEVEL: 100,

  /** XP window duration in hours (efficiency resets each window) */
  XP_WINDOW_HOURS: 6,

  /** Daily XP cap for combat skills (divided by 4 windows = per-window cap) */
  DAILY_CAP_COMBAT: 20_000,

  /** Daily XP cap for gathering skills (divided by 4 windows = per-window cap) */
  DAILY_CAP_GATHERING: 30_000,

  /** Daily XP cap for processing skills (divided by 4 windows = per-window cap) */
  DAILY_CAP_PROCESSING: 30_000,

  /** Daily XP cap for crafting skills (divided by 4 windows = per-window cap) */
  DAILY_CAP_CRAFTING: 30_000,

  /** Power for diminishing returns curve: efficiency = max(0, 1 - (xp/cap)^power) */
  EFFICIENCY_DECAY_POWER: 2,
} as const;

export const CHARACTER_CONSTANTS = {
  /** Character XP gained from skill XP after skill-side efficiency is applied. */
  XP_RATIO: 0.3,

  /** Maximum character level. */
  MAX_LEVEL: 100,

  /** Combat stat scaling from allocated attributes. */
  MELEE_DAMAGE_PER_STRENGTH: 1,
  RANGED_DAMAGE_PER_DEXTERITY: 1,
  MAGIC_DAMAGE_PER_INTELLIGENCE: 1,
  ACCURACY_PER_STRENGTH: 1,
  ACCURACY_PER_DEXTERITY: 1,
  ACCURACY_PER_INTELLIGENCE: 1,
  EVASION_TO_SPEED_DIVISOR: 10,
} as const;

// =============================================================================
// EXPLORATION
// =============================================================================

export const EXPLORATION_CONSTANTS = {
  AMBUSH_CHANCE_PER_TURN: 0.005,
  ENCOUNTER_SITE_CHANCE_PER_TURN: 0.0008,
  RESOURCE_NODE_CHANCE: 0.0005,
  HIDDEN_CACHE_CHANCE: 0.0001,
  TRAVEL_AMBUSH_CHANCE_PER_TURN: 0.04,
  ENCOUNTER_SITE_DECAY_RATE_PER_HOUR: 0.06,
  RESOURCE_NODE_DECAY_RATE_PER_HOUR: 0.65,
  ENCOUNTER_SIZE_SMALL: { min: 2, max: 3 },
  ENCOUNTER_SIZE_MEDIUM: { min: 4, max: 6 },
  ENCOUNTER_SIZE_LARGE: { min: 7, max: 10 },
  MIN_EXPLORATION_TURNS: 10,
  MAX_EXPLORATION_TURNS: 10_000,
} as const;

export const CHEST_CONSTANTS = {
  CHEST_RECIPE_CHANCE_SMALL: 0,
  CHEST_RECIPE_CHANCE_MEDIUM: 0.02,
  CHEST_RECIPE_CHANCE_LARGE: 0.05,
  CHEST_MATERIAL_ROLLS_SMALL: { min: 1, max: 2 },
  CHEST_MATERIAL_ROLLS_MEDIUM: { min: 2, max: 4 },
  CHEST_MATERIAL_ROLLS_LARGE: { min: 3, max: 6 },
} as const;

// =============================================================================
// DURABILITY
// =============================================================================

export const DURABILITY_CONSTANTS = {
  /** Durability lost per combat (per equipped item) */
  COMBAT_DEGRADATION: 1,

  /** Turn cost to repair an item */
  REPAIR_TURN_COST: 100,

  /** Turn cost to repair a broken (0 durability) item */
  BROKEN_REPAIR_TURN_COST: 150,

  /** Max durability lost per repair */
  REPAIR_MAX_DECAY: 5,

  /** Minimum max durability before item is destroyed */
  MIN_MAX_DURABILITY: 10,

  /** Percentage threshold for low-durability warnings */
  WARNING_THRESHOLD: 0.10,
} as const;

// =============================================================================
// GATHERING
// =============================================================================

export const GATHERING_CONSTANTS = {
  /** Base turns per gathering action */
  BASE_TURN_COST: 30,

  /** Base resource yield per action */
  BASE_YIELD: 1,

  /** Yield multiplier bonus per level above requirement (0.1 = +10% per level) */
  YIELD_MULTIPLIER_PER_LEVEL: 0.1,
} as const;

// =============================================================================
// GATHERING CRITS (precious gem drops)
// =============================================================================

export const GEM_CRIT_CONSTANTS = {
  /** Base chance for a gathering action to yield a bonus gem */
  BASE_CHANCE: 0.03,

  /** Additional gem crit chance per skill level above node requirement */
  LEVEL_BONUS: 0.005,

  /** Additional gem crit chance per point of equipped luck */
  LUCK_BONUS: 0.003,

  /** Maximum gem crit chance (cap) */
  MAX_CHANCE: 0.25,
} as const;

// =============================================================================
// CRAFTING
// =============================================================================

export const CRAFTING_CONSTANTS = {
  /** Base turns per crafting action */
  BASE_TURN_COST: 50,

  /** Durability bonus per 10 levels above requirement (%) */
  DURABILITY_BONUS_PER_10_LEVELS: 5,

  // Crafting Crit
  /** Base crit chance when skill level exactly matches recipe requirement */
  BASE_CRIT_CHANCE: 0.05,

  /** Additional crit chance per skill level above recipe requirement */
  CRIT_CHANCE_PER_LEVEL: 0.01,

  /** Additional crit chance per point of equipped luck */
  LUCK_CRIT_BONUS_PER_POINT: 0.002,

  /** Floor crit chance */
  MIN_CRIT_CHANCE: 0.01,

  /** Ceiling crit chance */
  MAX_CRIT_CHANCE: 0.5,

  /** Minimum crit bonus as a percent of the base stat */
  MIN_BONUS_PERCENT: 0.1,

  /** Maximum crit bonus as a percent of the base stat */
  MAX_BONUS_PERCENT: 0.3,

  /** Minimum guaranteed crit bonus value */
  MIN_BONUS_MAGNITUDE: 1,

  // Rare Craft (chance a crit produces rare instead of uncommon)
  RARE_CRAFT_BASE_CHANCE: 0.005,
  RARE_CRAFT_CHANCE_PER_LEVEL: 0.001,
  RARE_CRAFT_LUCK_BONUS_PER_POINT: 0.0005,
  RARE_CRAFT_MAX_CHANCE: 0.04,

  // Epic Craft (chance a crit produces epic)
  EPIC_CRAFT_BASE_CHANCE: 0.0005,
  EPIC_CRAFT_CHANCE_PER_LEVEL: 0.0001,
  EPIC_CRAFT_LUCK_BONUS_PER_POINT: 0.00005,
  EPIC_CRAFT_MAX_CHANCE: 0.004,

  /** Turn cost to salvage one crafted equipment item */
  SALVAGE_TURN_COST: 50,

  /** Base salvage refund rate (material quantity * rate, rounded down) */
  SALVAGE_BASE_REFUND_RATE: 0.6,

  /** Minimum quantity returned for at least one material */
  SALVAGE_MIN_PRIMARY_RETURN: 1,
} as const;

// =============================================================================
// ITEM RARITY
// =============================================================================

export const ITEM_RARITY_CONSTANTS = {
  ORDER: ['common', 'uncommon', 'rare', 'epic', 'legendary'],

  BONUS_SLOTS_BY_RARITY: {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  },

  DROP_WEIGHT_BY_RARITY: {
    common: 650,
    uncommon: 250,
    rare: 80,
    epic: 18,
    legendary: 2,
  },

  DROP_WEIGHT_SHIFT_PER_LEVEL_ABOVE_ONE: 2,

  DROP_WEIGHT_SHIFT_DISTRIBUTION: {
    uncommon: 2,
    rare: 1.2,
    epic: 0.6,
    legendary: 0.2,
  },

  UPGRADE_SUCCESS_BY_RARITY: {
    common: 0.6,
    uncommon: 0.35,
    rare: 0.15,
    epic: 0.05,
  },

  UPGRADE_TURN_COST_BY_RARITY: {
    common: 100,
    uncommon: 250,
    rare: 500,
    epic: 1000,
  },

  REROLL_TURN_COST_BY_RARITY: {
    uncommon: 75,
    rare: 150,
    epic: 300,
    legendary: 600,
  },

  FORGE_LUCK_SUCCESS_BONUS_PER_POINT: 0.001,
  FORGE_LUCK_SUCCESS_BONUS_CAP: 0.1,
} as const;

// =============================================================================
// HP & HEALTH
// =============================================================================

export const HP_CONSTANTS = {
  /** Base HP for all players */
  BASE_HP: 100,

  /** Additional HP per Vitality level */
  HP_PER_VITALITY: 5,

  /** Base passive HP regeneration per second */
  BASE_PASSIVE_REGEN: 0.4,

  /** Additional passive regen per Vitality level (per second) */
  PASSIVE_REGEN_PER_VITALITY: 0.04,

  /** Base HP healed per turn when resting */
  BASE_REST_HEAL: 2,

  /** Additional HP healed per turn per Vitality level */
  REST_HEAL_PER_VITALITY: 0.2,

  /** Turns required to recover from knockout (per max HP) */
  RECOVERY_TURNS_PER_MAX_HP: 1,

  /** HP percentage restored after recovery */
  RECOVERY_EXIT_HP_PERCENT: 0.25,
} as const;

export const FLEE_CONSTANTS = {
  /** Base chance to flee when evasion equals mob level */
  BASE_FLEE_CHANCE: 0.3,

  /** Flee chance adjustment per level difference (evasion - mobLevel) */
  FLEE_CHANCE_PER_LEVEL_DIFF: 0.02,

  /** Minimum flee chance (even against much higher level mobs) */
  MIN_FLEE_CHANCE: 0.05,

  /** Maximum flee chance (even against much lower level mobs) */
  MAX_FLEE_CHANCE: 0.95,

  /** Roll threshold for clean escape (top 20% of successful escapes) */
  HIGH_SUCCESS_THRESHOLD: 0.8,

  /** HP percentage remaining on clean escape */
  HIGH_SUCCESS_HP_PERCENT: 0.15,

  /** HP remaining on wounded escape */
  PARTIAL_SUCCESS_HP: 1,

  /** Gold loss percentage on clean escape */
  GOLD_LOSS_MINOR: 0.05,

  /** Gold loss percentage on wounded escape */
  GOLD_LOSS_MODERATE: 0.15,

  /** Gold loss percentage on knockout */
  GOLD_LOSS_SEVERE: 0.3,
} as const;

export const POTION_CONSTANTS = {
  /** HP restored by Minor Health Potion */
  MINOR_HEALTH_HEAL: 50,

  /** HP restored by Health Potion */
  HEALTH_HEAL: 150,

  /** HP restored by Greater Health Potion */
  GREATER_HEALTH_HEAL: 400,

  /** HP percentage restored by Minor Recovery Potion */
  MINOR_RECOVERY_PERCENT: 0.25,

  /** HP percentage restored by Recovery Potion */
  RECOVERY_PERCENT: 0.5,

  /** HP percentage restored by Greater Recovery Potion */
  GREATER_RECOVERY_PERCENT: 1.0,

  /** Rounds of Potion Sickness cooldown after auto-potion use */
  AUTO_POTION_SICKNESS_DURATION: 5,
} as const;

// =============================================================================
// ZONES
// =============================================================================

export const ZONE_CONSTANTS = {
  /** Base travel cost in turns */
  BASE_TRAVEL_COST: 100,

  /** Multiplier for difficult terrain */
  DIFFICULT_TERRAIN_MULTIPLIER: 2,
} as const;

// =============================================================================
// CHAT
// =============================================================================

export const CHAT_CONSTANTS = {
  MAX_MESSAGE_LENGTH: 200,
  HISTORY_LIMIT: 50,
  WORLD_RATE_LIMIT_MS: 2000,
  ZONE_RATE_LIMIT_MS: 1000,
} as const;

// =============================================================================
// PVP ARENA
// =============================================================================

export const PVP_CONSTANTS = {
  STARTING_RATING: 1000,
  K_FACTOR: 32,
  BRACKET_RANGE: 0.25,
  CHALLENGE_TURN_COST: 500,
  SCOUT_TURN_COST: 100,
  REVENGE_TURN_COST: 250,
  COOLDOWN_HOURS: 24,
  MIN_OPPONENTS_SHOWN: 10,
  MIN_CHARACTER_LEVEL: 10,
} as const;

// =============================================================================
// WORLD EVENTS
// =============================================================================

export const WORLD_EVENT_CONSTANTS = {
  RESOURCE_EVENT_DURATION_HOURS: 6,
  MOB_EVENT_DURATION_HOURS: 6,
  WORLD_WIDE_EVENT_DURATION_HOURS: 6,
  MAX_ZONE_EVENTS: 2,
  MAX_WORLD_EVENTS: 1,
  EVENT_RESPAWN_DELAY_MINUTES: 30,
  EVENT_DISCOVERY_CHANCE_PER_TURN: 0.0001,
  BOSS_INITIAL_WAIT_MINUTES: 15,
  BOSS_ROUND_INTERVAL_MINUTES: 5,
  BOSS_SIGNUP_TURN_COST: 200,

  // Boss spawning
  BOSS_SPAWN_CHANCE: 0.10,
  BOSS_DISCOVERY_CHANCE: 0.05,
  MAX_BOSS_ENCOUNTERS: 1,

  // Dynamic scaling by zone tier (index 0 = tier 1, through tier 5)
  BOSS_HP_PER_PLAYER_BY_TIER: [200, 500, 1000, 2000, 4000] as readonly number[],
  BOSS_AOE_PER_PLAYER_BY_TIER: [15, 30, 50, 80, 120] as readonly number[],
  BOSS_DEFENCE_BY_TIER: [5, 12, 20, 35, 50] as readonly number[],

  // Participant scaling
  HEALER_MAGIC_SCALING: 0.02,
  ATTACKER_TURN_SCALING: 0.001,

  PERSISTED_MOB_REGEN_PERCENT_PER_MINUTE: 1,
  PERSISTED_MOB_REENCOUNTER_CHANCE: 0.3,
  PERSISTED_MOB_MAX_AGE_MINUTES: 120,

  // Boss rewards
  BOSS_BASE_XP_REWARD_BY_TIER: [100, 250, 500, 1000, 2000] as readonly number[],
  BOSS_RECIPE_DROP_CHANCE: 0.15,
  BOSS_RARITY_BONUS: 5,
  // Trophy drops keyed by boss mob template name. WARNING: keys must match mob
  // template names in seed-data/mobs.ts exactly — a mismatch silently disables drops.
  BOSS_TROPHY_DROPS: {
    'Alpha Wolf': [{ itemName: 'Alpha Wolf Fang', minQty: 2, maxQty: 4 }],
    'Ancient Spirit': [{ itemName: 'Spirit Essence', minQty: 2, maxQty: 4 }],
  } as Record<string, Array<{ itemName: string; minQty: number; maxQty: number }>>,
} as const;

// =============================================================================
// ZONE EXPLORATION PROGRESSION
// =============================================================================

export const ZONE_EXPLORATION_CONSTANTS = {
  DEFAULT_TIERS: { '1': 0, '2': 25, '3': 50, '4': 75 } as Record<string, number>,
  NEWEST_TIER_WEIGHT_MULTIPLIER: 2,
} as const;

// =============================================================================
// TIER BLEEDTHROUGH
// =============================================================================

export const TIER_BLEED_CONSTANTS = {
  CURRENT_TIER_WEIGHT: 0.75,
  PLUS_ONE_TIER_WEIGHT: 0.20,
  PLUS_TWO_TIER_WEIGHT: 0.05,
} as const;

// =============================================================================
// ROOM CONFIGURATION
// =============================================================================

export const ROOM_CONSTANTS = {
  ROOMS_SMALL: { min: 1, max: 1 },
  ROOMS_MEDIUM: { min: 2, max: 2 },
  ROOMS_LARGE: { min: 3, max: 4 },
  MOBS_PER_ROOM_SMALL: { min: 2, max: 4 },
  MOBS_PER_ROOM_MEDIUM: { min: 2, max: 4 },
  MOBS_PER_ROOM_LARGE: { min: 2, max: 5 },
} as const;

// =============================================================================
// FULL-CLEAR BONUSES
// =============================================================================

export const FULL_CLEAR_CONSTANTS = {
  DROP_MULTIPLIER: 1.5,
  RECIPE_MULTIPLIER: 1.5,
  CHEST_TIER_UPGRADE: true,
} as const;

// =============================================================================
// LEADERBOARD
// =============================================================================

export const LEADERBOARD_CONSTANTS = {
  REFRESH_INTERVAL_MS: 900_000,
  PAGE_SIZE: 25,
  TOP_N: 25,
} as const;
