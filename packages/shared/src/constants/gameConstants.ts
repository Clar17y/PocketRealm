/**
 * Central game constants - all tunable values in one place.
 * Change these to adjust game balance without touching logic.
 */

import type { CombatMode, HitCurveConfig } from '../types/combat.types';
import type {
  GuildProjectDefinition,
  GuildSpecializationDefinition,
} from '../types/guild.types';
import type { QuestTemplateDefinition } from '../types/quest.types';

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

  /** Weight of resource cost (stamina + mana) for XP splitting.
   *  1 point of resource spent = this many "contribution points" alongside damage. */
  RESOURCE_XP_WEIGHT: 0.5,

  /** Turn cost for a single encounter */
  ENCOUNTER_TURN_COST: 50,

  /** Divisor for diminishing-returns defence reduction: def / (def + factor) */
  DEFENCE_SCALING_FACTOR: 100,
} as const;

export const HIT_CURVE_CONSTANTS = {
  pvp: { minHitChance: 0.10, maxHitChance: 0.95, bias: 5, exponent: 2.4 },
  pve_open_world: { minHitChance: 0.25, maxHitChance: 0.95, bias: 10, exponent: 1.5 },
  pve_expedition: { minHitChance: 0.20, maxHitChance: 0.95, bias: 8, exponent: 1.8 },
  pve_boss: { minHitChance: 0.35, maxHitChance: 0.98, bias: 12, exponent: 1.35 },
} as const satisfies Record<CombatMode, HitCurveConfig>;

export const STARTER_LOADOUT = {
  tutorialOffHandTemplateId: 'starter_wayfinder_buckler',
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
  belt: { primary: ['armor', 'magicDefence', 'health'], utility: ['luck', 'inventorySlots'] },
  ring: { primary: ['luck', 'accuracy', 'critChance', 'critDamage'], utility: ['dodge'] },
  charm: { primary: ['luck', 'accuracy', 'dodge', 'critChance', 'critDamage'], utility: ['health'] },
  backpack: { primary: ['inventorySlots'], utility: ['luck'] },
};

// =============================================================================
// SKILLS & XP
// =============================================================================

export const SKILL_CONSTANTS = {
  /** Base XP needed for level 2 */
  XP_BASE: 100,

  /** Exponent for XP curve: xp_for_level = base * (level ^ exponent) */
  XP_EXPONENT: 2.0,

  /** Maximum level */
  MAX_LEVEL: 100,

  /** XP window duration in hours (efficiency resets each window) */
  XP_WINDOW_HOURS: 12,

  /** Daily XP cap for combat skills (divided by 2 windows = per-window cap) */
  DAILY_CAP_COMBAT: 14_000,

  /** Daily XP cap for gathering skills (divided by 2 windows = per-window cap) */
  DAILY_CAP_GATHERING: 20_000,

  /** Daily XP cap for processing skills (divided by 2 windows = per-window cap) */
  DAILY_CAP_PROCESSING: 20_000,

  /** Daily XP cap for crafting skills (divided by 2 windows = per-window cap) */
  DAILY_CAP_CRAFTING: 20_000,

  /** Power for diminishing returns curve: efficiency = max(0, 1 - (xp/cap)^power) */
  EFFICIENCY_DECAY_POWER: 2,

  /** Maximum combined XP boost multiplier (guild + shop + future sources) */
  MAX_XP_BOOST: 0.50,
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
  HIDDEN_CACHE_CHANCE: 0.0002,
  TRAVEL_AMBUSH_CHANCE_PER_TURN: 0.04,
  ENCOUNTER_SITE_DECAY_RATE_PER_HOUR: 0.06,
  RESOURCE_NODE_DECAY_RATE_PER_HOUR: 0.65,
  ENCOUNTER_SIZE_SMALL: { min: 2, max: 3 },
  ENCOUNTER_SIZE_MEDIUM: { min: 4, max: 6 },
  ENCOUNTER_SIZE_LARGE: { min: 7, max: 10 },
  MIN_EXPLORATION_TURNS: 100,
  MAX_EXPLORATION_TURNS: 2_500,
  ZONE_EXIT_SCALING_START: 50,
  ZONE_EXIT_SCALING_MAX_MULTIPLIER: 20,
} as const;

export const CHEST_CONSTANTS = {
  CHEST_RECIPE_CHANCE_SMALL: 0.005,
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
  /** Durability lost per hit landed (weapon) or received (armor) */
  COMBAT_DEGRADATION: 0.03,

  /** Combat-context multipliers applied to base degradation */
  DEGRADATION_MULTIPLIER: {
    default: 1,
    elite: 1.5,
    mini_boss: 2,
    final_boss: 3,
    world_boss: 3,
  } as const,

  /** Turn cost to repair by item tier */
  REPAIR_TURN_COST_BY_TIER: {
    1: 50, 2: 75, 3: 100, 4: 125, 5: 150,
  } as const,

  /** Broken item repair cost = tier cost × this */
  BROKEN_REPAIR_MULTIPLIER: 1.5,

  /** Max durability decay per repair, by rarity */
  REPAIR_MAX_DECAY_BY_RARITY: {
    common: 5, uncommon: 4, rare: 3, epic: 2, legendary: 1,
  } as const,

  /** Items destroyed when maxDurability reaches this */
  MIN_MAX_DURABILITY: 0,

  /** Fraction of max durability that triggers low-durability warning */
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

  /** Base XP awarded per gathering action */
  XP_PER_ACTION_BASE: 5,

  /** Divisor for node level → bonus XP (total = base + floor(level / divisor)) */
  XP_LEVEL_SCALING_DIVISOR: 4,
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

  /** Max items per batch salvage request */
  SALVAGE_BATCH_LIMIT: 50,

  /** Max quantity per craft request */
  MAX_CRAFT_QUANTITY: 100,
} as const;

// =============================================================================
// INVENTORY & BACKPACK
// =============================================================================

export const INVENTORY_CONSTANTS = {
  BASE_CAPACITY: 24,
  BACKPACK_SLOTS_PER_TIER: 8,
  BACKPACK_SLOTS_PER_RARITY: 2,
  BELT_INVENTORY_SLOTS_MIN: 4,
  BELT_INVENTORY_SLOTS_MAX: 8,
  CHAMPION_BONUS_SLOTS: 8,
  PENDING_LOOT_TTL_SECONDS: 600,
} as const;

export const SELL_CONSTANTS = {
  RARITY_MULTIPLIERS: {
    common: 1,
    uncommon: 2,
    rare: 4,
    epic: 8,
    legendary: 16,
  },
  DURABILITY_PENALTY_THRESHOLD: 0.5,
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

  /** Turn cost discount per skill level above recipe requirement (20% per level) */
  FORGE_DISCOUNT_PER_LEVEL_ABOVE: 0.20,
  /** Max skill levels above recipe for full (free) discount */
  FORGE_DISCOUNT_MAX_LEVELS: 5,
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
  LOW_HP_WARNING_THRESHOLD: 0.25,
} as const;

export const FLEE_CONSTANTS = {
  /** Base chance to flee when evasion equals mob level */
  BASE_FLEE_CHANCE: 0.5,

  /** Flee chance adjustment per level difference (evasion - mobLevel) */
  FLEE_CHANCE_PER_LEVEL_DIFF: 0.03,

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

// =============================================================================
// STAMINA
// =============================================================================

export const STAMINA_CONSTANTS = {
  /** Base stamina pool for all players */
  BASE_POOL: 100,
  /** Additional stamina per average of (melee, ranged, evasion) levels */
  POOL_PER_SKILL_LEVEL: 3,
  /** Base stamina regen per combat round */
  BASE_REGEN_PER_ROUND: 10,
  /** Additional regen per average combat skill level */
  REGEN_PER_SKILL_LEVEL: 0.2,
  /** Out-of-combat regen rate (per second, like HP) */
  PASSIVE_REGEN_PER_SECOND: 1.0,
  /** Additional passive regen per avg(melee, ranged, evasion) level */
  PASSIVE_REGEN_PER_SKILL_LEVEL: 0.02,
  /** Heal per turn when resting */
  REST_HEAL_PER_TURN: 5,
  /** Additional rest heal per avg(melee, ranged, evasion) level */
  REST_HEAL_PER_SKILL_LEVEL: 0.3,
} as const;

// =============================================================================
// MANA
// =============================================================================

export const MANA_CONSTANTS = {
  /** Base mana pool for all players */
  BASE_POOL: 50,
  /** Additional mana per magic skill level */
  POOL_PER_MAGIC_LEVEL: 3,
  /** Base mana regen per combat round */
  BASE_REGEN_PER_ROUND: 5,
  /** Additional regen per magic skill level */
  REGEN_PER_MAGIC_LEVEL: 0.15,
  /** Out-of-combat regen rate (per second) */
  PASSIVE_REGEN_PER_SECOND: 0.5,
  /** Additional passive regen per magic skill level */
  PASSIVE_REGEN_PER_MAGIC_LEVEL: 0.015,
  /** Heal per turn when resting */
  REST_HEAL_PER_TURN: 3,
  /** Additional rest heal per magic skill level */
  REST_HEAL_PER_MAGIC_LEVEL: 0.2,
} as const;

// =============================================================================
// COMBAT ACTIONS
// =============================================================================

export const COMBAT_ACTION_CONSTANTS = {
  /** Defend: free fallback */
  DEFEND_DAMAGE_REDUCTION: 0.35,
  /** Counter/Ward costs */
  COUNTER_STAMINA_COST: 35,
  WARD_MANA_COST: 30,
  /** Light attack: stamina-neutral (cost = base regen) */
  LIGHT_ATTACK_STAMINA: 10,
  NORMAL_ATTACK_STAMINA: 20,
  HEAVY_ATTACK_STAMINA: 35,
  /** Spell base stamina cost (all actions cost stamina) */
  SPELL_BASE_STAMINA: 15,
  /** Use potion stamina cost */
  USE_POTION_STAMINA: 5,
  /** Buff stamina cost */
  BUFF_BASE_STAMINA: 10,
  /** Taunt stamina cost */
  TAUNT_STAMINA: 20,
  /** Heal stamina cost */
  HEAL_BASE_STAMINA: 10,
  /** Bonus damage multiplier when hitting a channeling target */
  CHANNELING_BONUS_DAMAGE: 1.5,
  /** Max active buffs simultaneously */
  MAX_ACTIVE_BUFFS: 3,
  /** Potion sickness duration (rounds) — shared across HP/Stam/Mana potions */
  POTION_SICKNESS_ROUNDS: 4,

  // Melee talent actions
  POWER_STRIKE_STAMINA: 15,
  CLEAVE_STAMINA: 30,
  BATTLE_CRY_STAMINA: 20,
  DEVASTATING_BLOW_STAMINA: 35,
  BERSERKER_RAGE_STAMINA: 30,
  EXECUTE_STAMINA: 40,
  WHIRLWIND_STAMINA: 40,
  TITANS_WRATH_STAMINA: 50,

  // Ranged talent actions
  AIMED_SHOT_STAMINA: 15,
  CRIPPLING_SHOT_STAMINA: 20,
  EAGLE_EYE_STAMINA: 15,
  SCATTER_SHOT_STAMINA: 30,
  VOLLEY_STAMINA: 40,
  SNIPERS_MARK_STAMINA: 25,
  PIERCING_SHOT_STAMINA: 35,
  DEATH_MARK_STAMINA: 45,

  // Magic talent actions
  FIRE_BOLT_MANA: 15,
  MINOR_HEAL_MANA: 20,
  FROST_NOVA_MANA: 30,
  ENHANCED_FORTITUDE_MANA: 25,
  HEAL_ALLY_MANA: 35,
  ARCANE_BLAST_MANA: 40,
  REGENERATION_MANA: 30,
  BLIZZARD_MANA: 40,
  METEOR_STRIKE_MANA: 50,

  // Survival talent actions
  FORTIFY_STAMINA: 15,
  FORTIFY_MANA: 10,
  RALLY_STAMINA: 25,
  RALLY_MANA: 15,

  // Cross-type talent actions
  FLAME_SWORD_STAMINA: 25,
  FLAME_SWORD_MANA: 15,
  VENOMOUS_STRIKE_STAMINA: 25,
  VENOMOUS_STRIKE_MANA: 10,
  RENDING_SLASH_STAMINA: 25,
  FLAME_ARROW_STAMINA: 20,
  FLAME_ARROW_MANA: 15,
  BARBED_ARROW_STAMINA: 20,
  SHADOW_ARROW_STAMINA: 15,
  SHADOW_ARROW_MANA: 25,
  EARTH_SPIKES_STAMINA: 10,
  EARTH_SPIKES_MANA: 30,
  LIFE_DRAIN_MANA: 35,
  CURSE_MANA: 20,
  ENFEEBLE_MANA: 15,

  // Utility potion actions
  USE_CLEANSE_POTION_STAMINA: 5,
  USE_BUFF_POTION_STAMINA: 5,
} as const;

// =============================================================================
// SKILL POINTS
// =============================================================================

export const SKILL_POINT_CONSTANTS = {
  /** Skill points earned per skill level-up (all 14 skills) */
  POINTS_PER_LEVEL: 1,
  /** Turn cost to respec all skill points */
  RESPEC_TURN_COST: 50_000,
  /** Max saved combat templates */
  MAX_TEMPLATES: 10,
  /** Default template action (light attack ID) */
  DEFAULT_ACTION_ID: 'light_attack',
} as const;

export const POTION_CONSTANTS = {
  /** HP restored by Minor Health Potion */
  MINOR_HEALTH_HEAL: 50,

  /** HP restored by Health Potion */
  HEALTH_HEAL: 150,

  /** HP restored by Greater Health Potion */
  GREATER_HEALTH_HEAL: 400,

  // Stamina potions
  MINOR_STAMINA_RESTORE: 30,
  STAMINA_RESTORE: 60,
  GREATER_STAMINA_RESTORE: 100,

  // Mana potions (T1–T5; T1/T4/T5 names are pre-existing and referenced externally)
  MINOR_MANA_RESTORE: 25,  // T1
  MANA_RESTORE_T2: 45,     // T2
  MANA_RESTORE_T3: 65,     // T3
  MANA_RESTORE: 80,        // T4
  GREATER_MANA_RESTORE: 100, // T5
} as const;

export const BUFF_POTION_CONSTANTS = {
  ELIXIR_ATTACK_PERCENT: 0.25,
  ELIXIR_DURATION: 5,
  RESIST_DEFENCE_BONUS: 15,
  RESIST_MAGIC_DEFENCE_BONUS: 15,
  RESIST_DURATION: 5,
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
  MIN_BRACKET_HALF_WIDTH: 100,
  CHALLENGE_TURN_COST: 500,
  SCOUT_TURN_COST: 100,
  REVENGE_TURN_COST: 250,
  COOLDOWN_HOURS: 6,
  MIN_OPPONENTS_SHOWN: 10,
  BRACKET_WIDEN_STEP: 50,
  BRACKET_MAX_WIDEN_ITERATIONS: 10,
  MIN_CHARACTER_LEVEL: 10,
} as const;

// =============================================================================
// WORLD EVENTS
// =============================================================================

export const WORLD_EVENT_CONSTANTS = {
  RESOURCE_EVENT_DURATION_HOURS: 6,
  MOB_EVENT_DURATION_HOURS: 6,
  WORLD_WIDE_EVENT_DURATION_HOURS: 4,
  MAX_ZONE_EVENTS: 2,
  MAX_WORLD_EVENTS: 1,
  EVENT_RESPAWN_DELAY_MINUTES: 30,
  EVENT_DISCOVERY_CHANCE_PER_TURN: 0.0001,
  BOSS_INITIAL_WAIT_MINUTES: 15,
  BOSS_ROUND_INTERVAL_MINUTES: 5,
  BOSS_SIGNUP_TURN_COST: 200,

  // Boss spawning
  BOSS_DISCOVERY_CHANCE: 0.05,
  MAX_BOSS_ENCOUNTERS: 1,
  BOSS_SPAWN_INTERVAL_HOURS: 12,

  // Dynamic scaling by zone tier (index 0 = tier 1, through tier 5)
  BOSS_HP_PER_PLAYER_BY_TIER: [150, 300, 600, 1000, 1500] as readonly number[],
  BOSS_AOE_PER_PLAYER_BY_TIER: [15, 30, 50, 80, 120] as readonly number[],
  BOSS_DEFENCE_BY_TIER: [5, 12, 20, 35, 50] as readonly number[],

  PERSISTED_MOB_REGEN_PERCENT_PER_MINUTE: 1,
  PERSISTED_MOB_REENCOUNTER_CHANCE: 0.3,
  PERSISTED_MOB_MAX_AGE_MINUTES: 120,

  // Boss rewards
  BOSS_BASE_XP_REWARD_BY_TIER: [100, 250, 500, 1000, 2000] as readonly number[],
  BOSS_CONTRIBUTION_FLOOR: 0.25,
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
// BOSS ENCOUNTER (individual HP model, threat/aggro, contribution loot)
// =============================================================================

export const BOSS_ENCOUNTER_CONSTANTS = {
  THREAT_PER_DAMAGE: 1,
  THREAT_PER_HEAL: 0.5,
  TAUNT_THREAT_BONUS: 500,
  TAUNT_DEFAULT_DURATION: 2,
  CONTRIBUTION_DAMAGE_WEIGHT: 1.0,
  CONTRIBUTION_HEALING_WEIGHT: 1.0,
  CONTRIBUTION_ABSORB_WEIGHT: 0.9,
  CONTRIBUTION_SURVIVAL_FLAT_BONUS: 10,
} as const;

// =============================================================================
// GEM TIER MAPPING (gathering skill + node level → gem name)
// =============================================================================

export const GEM_CONSTANTS = {
  GEM_BY_SKILL_TIER: {
    mining: { 1: 'Rough Ruby', 2: 'Rough Sapphire', 3: 'Rough Emerald', 4: 'Rough Diamond', 5: 'Rough Opal' },
    foraging: { 1: 'Raw Amber', 2: 'Raw Pearl', 3: 'Raw Jade', 4: 'Raw Moonstone', 5: 'Raw Starcrystal' },
    woodcutting: { 1: 'Tree Resin', 2: 'Fossilized Sap', 3: 'Crystal Bark', 4: 'Heartwood Gem', 5: 'Ancient Amber' },
  } as Record<string, Record<number, string>>,
  LEVEL_TO_TIER_THRESHOLDS: [
    { minLevel: 28, tier: 5 },
    { minLevel: 20, tier: 4 },
    { minLevel: 12, tier: 3 },
    { minLevel: 5, tier: 2 },
    { minLevel: 0, tier: 1 },
  ],
} as const;

export function levelToGemTier(levelRequired: number): number {
  for (const { minLevel, tier } of GEM_CONSTANTS.LEVEL_TO_TIER_THRESHOLDS) {
    if (levelRequired >= minLevel) return tier;
  }
  return 1;
}

// =============================================================================
// HIDDEN CACHE REWARDS
// =============================================================================

export const HIDDEN_CACHE_CONSTANTS = {
  MATERIAL_ROLLS_MIN: 2,
  MATERIAL_ROLLS_MAX: 4,
  SOULBOUND_DROP_CHANCE: 0.15,
  LUCK_RARITY_SCALING: 0.005,
  RARITY_WEIGHTS: {
    common: 50,
    uncommon: 30,
    rare: 15,
    epic: 5,
    legendary: 1,
  },
} as const;

// =============================================================================
// ZONE EXPLORATION PROGRESSION
// =============================================================================

export const ZONE_EXPLORATION_CONSTANTS = {
  DEFAULT_TIERS: { '1': 0, '2': 25, '3': 50, '4': 75 } as Record<string, number>,
  NEWEST_TIER_WEIGHT_MULTIPLIER: 2,
} as const;

// =============================================================================
// TIER NAMES
// =============================================================================

export const TIER_NAME_CONSTANTS = {
  NAMES: { 1: 'Outskirts', 2: 'Interior', 3: 'Depths', 4: 'Apex' } as Record<number, string>,
} as const;

// =============================================================================
// TIER BLEEDTHROUGH
// =============================================================================

export const TIER_BLEED_CONSTANTS = {
  TWO_BELOW: 0.10,
  ONE_BELOW: 0.15,
  SELECTED: 0.50,
  ONE_ABOVE: 0.15,
  TWO_ABOVE: 0.10,
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

// =============================================================================
// GUILD
// =============================================================================

export const GUILD_CONSTANTS = {
  /** Turn cost to create a guild */
  CREATION_TURN_COST: 50_000,
  /** Minimum character level to create a guild */
  CREATION_MIN_LEVEL: 20,
  /** Minimum character level to join a guild */
  JOIN_MIN_LEVEL: 10,
  /** Base max members at guild level 1 */
  BASE_MAX_MEMBERS: 10,
  /** Additional member slots per 2 guild levels */
  MEMBERS_PER_TWO_LEVELS: 1,
  /** Maximum tax rate (percentage) */
  MAX_TAX_RATE: 20,
  /** Base treasury capacity */
  TREASURY_BASE_CAP: 100_000,
  /** Additional treasury capacity per guild level */
  TREASURY_CAP_PER_LEVEL: 10_000,
  /** Guild level required to unlock specialization */
  SPECIALIZATION_UNLOCK_LEVEL: 10,
  /** Treasury cost to respec specialization */
  SPECIALIZATION_RESPEC_COST: 2_000_000,
  /** Hours of XP activity required to be considered "active" for boost eligibility */
  BOOST_ELIGIBILITY_WINDOW_HOURS: 48,
  /** Active member thresholds for boost scaling: <5 = 50%, 5-9 = 75%, 10+ = 100% */
  BOOST_SCALING_MIN_FULL: 10,
  BOOST_SCALING_MIN_MEDIUM: 5,
  BOOST_SCALING_FULL: 1.0,
  BOOST_SCALING_MEDIUM: 0.75,
  BOOST_SCALING_LOW: 0.5,
  /** XP required per guild level: floor(BASE * level^EXPONENT) */
  XP_PER_LEVEL_BASE: 100,
  XP_PER_LEVEL_EXPONENT: 1.8,
  /** Guild XP earned per member action */
  XP_PER_MOB_KILL: 1,
  XP_PER_CRAFT: 2,
  XP_PER_BOSS_ROUND: 10,
  XP_PER_MEMBER_JOIN: 50,
  /** Guild log page size */
  LOG_PAGE_SIZE: 50,
  /** Max description length */
  MAX_DESCRIPTION_LENGTH: 200,
  /** Guild name constraints */
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 32,
  /** Guild tag constraints */
  MIN_TAG_LENGTH: 2,
  MAX_TAG_LENGTH: 4,
} as const;

// =============================================================================
// GUILD UPGRADES
// =============================================================================

export type GuildUpgradeEffectType =
  | 'xp_boost'
  | 'gathering_yield'
  | 'crafting_crit'
  | 'combat_damage'
  | 'defense_boost';

export interface GuildUpgradeTier {
  level: number;
  effectValue: number;
  cost: number;
  durationMs: number;
}

export interface GuildUpgradeDefinition {
  key: string;
  name: string;
  effectType: GuildUpgradeEffectType;
  tiers: readonly GuildUpgradeTier[];
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export const GUILD_UPGRADE_DEFINITIONS: readonly GuildUpgradeDefinition[] = [
  {
    key: 'xp_boost',
    name: 'XP Boost',
    effectType: 'xp_boost',
    tiers: [
      { level: 1, effectValue: 0.05, cost: 5_000, durationMs: TWO_HOURS_MS },
      { level: 10, effectValue: 0.10, cost: 10_000, durationMs: TWO_HOURS_MS },
      { level: 25, effectValue: 0.15, cost: 20_000, durationMs: TWO_HOURS_MS },
    ],
  },
  {
    key: 'gathering_yield',
    name: 'Gathering Yield',
    effectType: 'gathering_yield',
    tiers: [
      { level: 1, effectValue: 0.10, cost: 5_000, durationMs: TWO_HOURS_MS },
      { level: 10, effectValue: 0.20, cost: 10_000, durationMs: TWO_HOURS_MS },
      { level: 25, effectValue: 0.30, cost: 20_000, durationMs: TWO_HOURS_MS },
    ],
  },
  {
    key: 'crafting_fortune',
    name: 'Crafting Fortune',
    effectType: 'crafting_crit',
    tiers: [
      { level: 1, effectValue: 0.05, cost: 8_000, durationMs: TWO_HOURS_MS },
      { level: 10, effectValue: 0.10, cost: 15_000, durationMs: TWO_HOURS_MS },
      { level: 25, effectValue: 0.15, cost: 25_000, durationMs: TWO_HOURS_MS },
    ],
  },
  {
    key: 'warriors_might',
    name: "Warrior's Might",
    effectType: 'combat_damage',
    tiers: [
      { level: 1, effectValue: 0.05, cost: 8_000, durationMs: TWO_HOURS_MS },
      { level: 10, effectValue: 0.10, cost: 15_000, durationMs: TWO_HOURS_MS },
      { level: 25, effectValue: 0.15, cost: 25_000, durationMs: TWO_HOURS_MS },
    ],
  },
  {
    key: 'iron_skin',
    name: 'Iron Skin',
    effectType: 'defense_boost',
    tiers: [
      { level: 1, effectValue: 0.05, cost: 5_000, durationMs: TWO_HOURS_MS },
      { level: 10, effectValue: 0.10, cost: 10_000, durationMs: TWO_HOURS_MS },
      { level: 25, effectValue: 0.15, cost: 20_000, durationMs: TWO_HOURS_MS },
    ],
  },
] as const;

// =============================================================================
// GUILD CONTRACTS
// =============================================================================

export type GuildContractType =
  | 'kill_count'
  | 'kill_family'
  | 'boss_rounds'
  | 'craft_items'
  | 'craft_rare'
  | 'gather_actions'
  | 'exploration_turns'
  | 'pvp_wins';

export type GuildContractCategory = 'combat' | 'crafting' | 'gathering' | 'exploration' | 'pvp';

export interface GuildContractDefinition {
  key: GuildContractType;
  name: string;
  category: GuildContractCategory;
  targets: { low: number; mid: number; high: number };
}

export const GUILD_CONTRACT_DEFINITIONS: readonly GuildContractDefinition[] = [
  { key: 'kill_count', name: 'Mob Slayer', category: 'combat', targets: { low: 2_000, mid: 5_000, high: 15_000 } },
  { key: 'kill_family', name: 'Family Hunter', category: 'combat', targets: { low: 5_000, mid: 15_000, high: 40_000 } },
  { key: 'boss_rounds', name: 'Boss Challenger', category: 'combat', targets: { low: 500, mid: 1_500, high: 3_750 } },
  { key: 'craft_items', name: 'Master Crafter', category: 'crafting', targets: { low: 5_000, mid: 20_000, high: 50_000 } },
  { key: 'craft_rare', name: 'Rare Artisan', category: 'crafting', targets: { low: 50, mid: 150, high: 500 } },
  { key: 'gather_actions', name: 'Resource Gatherer', category: 'gathering', targets: { low: 10_000, mid: 40_000, high: 100_000 } },
  { key: 'exploration_turns', name: 'Pathfinder', category: 'exploration', targets: { low: 500_000, mid: 2_000_000, high: 5_000_000 } },
  { key: 'pvp_wins', name: 'Arena Champion', category: 'pvp', targets: { low: 1_000, mid: 3_000, high: 10_000 } },
] as const;

export const GUILD_CONTRACT_CONSTANTS = {
  CONTRACTS_PER_WEEK: 3,
  MIN_CATEGORIES: 2,
  REWARD_GUILD_XP_MIN: 200,
  REWARD_GUILD_XP_MAX: 800,
  REWARD_TREASURY_MIN: 500,
  REWARD_TREASURY_MAX: 2_000,
} as const;

// =============================================================================
// GUILD PROJECTS
// =============================================================================

export const GUILD_MATERIAL_CATEGORIES: Record<string, readonly string[]> = {
  ore: ['Copper Ore', 'Tin Ore', 'Iron Ore', 'Sandstone', 'Dark Iron Ore', 'Mithril Ore', 'Ancient Ore'],
  ingot: ['Copper Ingot', 'Tin Ingot', 'Iron Ingot', 'Cut Stone', 'Dark Iron Ingot', 'Mithril Ingot', 'Ancient Ingot'],
  log: ['Oak Log', 'Maple Log', 'Fungal Wood', 'Elderwood Log', 'Willow Log', 'Bogwood Log', 'Crystal Wood', 'Petrified Wood'],
  plank: ['Oak Plank', 'Maple Plank', 'Fungal Plank', 'Elderwood Plank', 'Willow Plank', 'Bogwood Plank', 'Crystal Plank', 'Petrified Plank'],
  herb: ['Forest Sage', 'Moonpetal', 'Cave Moss', 'Starbloom', 'Glowcap Mushroom', 'Windbloom', 'Gravemoss', 'Shimmer Fern', 'Abyssal Kelp'],
  leather: ['Rat Leather', 'Boar Leather', 'Wolf Leather', 'Bat Leather', 'Warg Leather', 'Croc Leather', 'Naga Leather'],
  cloth: ['Silk Cloth', 'Woven Cloth', 'Fae Fabric', 'Cursed Fabric', 'Ethereal Cloth', 'Spectral Fabric'],
} as const;

export function getCategoryForTemplate(templateName: string): string | null {
  for (const [category, names] of Object.entries(GUILD_MATERIAL_CATEGORIES)) {
    if ((names as readonly string[]).includes(templateName)) return category;
  }
  return null;
}

export const GUILD_PROJECT_CONSTANTS = {
  /** Max materials a single player can contribute to one project (per category) */
  PER_PROJECT_MATERIAL_CAP: 200,
  /** Max turns a single player can contribute to one project */
  PER_PROJECT_TURN_CAP: 10_000,
  MAX_ACTIVE_PROJECTS: 1,
} as const;

export const GUILD_PROJECT_DEFINITIONS: readonly GuildProjectDefinition[] = [
  // --- Level 1: No prerequisites ---
  {
    key: 'guild_forge',
    name: 'Guild Forge',
    description: 'A communal forge that improves crafting outcomes for all members.',
    level: 1,
    prerequisites: [],
    treasuryCost: 500_000,
    materialCosts: [
      { category: 'ore', quantity: 2_000 },
      { category: 'ingot', quantity: 1_000 },
    ],
    memberTurnGoal: 100_000,
    perks: [{ effectType: 'craftingCrit', value: 0.05 }],
    guildXpReward: 500,
  },
  {
    key: 'war_room',
    name: 'War Room',
    description: 'A strategic planning center that sharpens combat skills.',
    level: 1,
    prerequisites: [],
    treasuryCost: 500_000,
    materialCosts: [
      { category: 'leather', quantity: 1_500 },
      { category: 'plank', quantity: 1_000 },
    ],
    memberTurnGoal: 100_000,
    perks: [{ effectType: 'xpBoost', value: 0.05 }],
    guildXpReward: 500,
  },
  {
    key: 'scout_network',
    name: 'Scout Network',
    description: 'A network of scouts that reduces travel time across zones.',
    level: 1,
    prerequisites: [],
    treasuryCost: 500_000,
    materialCosts: [
      { category: 'herb', quantity: 1_000 },
      { category: 'plank', quantity: 1_500 },
    ],
    memberTurnGoal: 100_000,
    perks: [{ effectType: 'travelCostReduction', value: 0.10 }],
    guildXpReward: 500,
  },
  // --- Level 2: Require one Level 1 ---
  {
    key: 'advanced_forge',
    name: 'Advanced Forge',
    description: 'An upgraded forge with superior tools and techniques.',
    level: 2,
    prerequisites: ['guild_forge'],
    treasuryCost: 2_000_000,
    materialCosts: [
      { category: 'ore', quantity: 5_000 },
      { category: 'ingot', quantity: 2_000 },
    ],
    memberTurnGoal: 400_000,
    perks: [{ effectType: 'craftingCrit', value: 0.10 }],
    guildXpReward: 1_000,
  },
  {
    key: 'barracks',
    name: 'Barracks',
    description: 'Training grounds that hone combat expertise.',
    level: 2,
    prerequisites: ['war_room'],
    treasuryCost: 2_000_000,
    materialCosts: [
      { category: 'leather', quantity: 3_000 },
      { category: 'ingot', quantity: 2_000 },
    ],
    memberTurnGoal: 400_000,
    perks: [{ effectType: 'xpBoost', value: 0.10 }],
    guildXpReward: 1_000,
  },
  {
    key: 'cartographers_lodge',
    name: "Cartographer's Lodge",
    description: 'Expert mapmakers chart safer and faster travel routes.',
    level: 2,
    prerequisites: ['scout_network'],
    treasuryCost: 2_000_000,
    materialCosts: [
      { category: 'plank', quantity: 2_500 },
      { category: 'herb', quantity: 2_000 },
    ],
    memberTurnGoal: 400_000,
    perks: [{ effectType: 'travelCostReduction', value: 0.20 }],
    guildXpReward: 1_000,
  },
  {
    key: 'apothecary',
    name: 'Apothecary',
    description: 'An alchemical lab that reduces repair costs guild-wide.',
    level: 2,
    prerequisites: [], // requires ANY one L1 project (checked in service)
    treasuryCost: 1_500_000,
    materialCosts: [
      { category: 'herb', quantity: 2_000 },
      { category: 'cloth', quantity: 1_500 },
    ],
    memberTurnGoal: 300_000,
    perks: [{ effectType: 'repairCostReduction', value: 0.10 }],
    guildXpReward: 800,
  },
  // --- Level 3: Require two Level 2 ---
  {
    key: 'master_workshop',
    name: 'Master Workshop',
    description: 'The pinnacle of guild craftsmanship.',
    level: 3,
    prerequisites: ['advanced_forge', 'apothecary'],
    treasuryCost: 5_000_000,
    materialCosts: [
      { category: 'ore', quantity: 10_000 },
      { category: 'ingot', quantity: 5_000 },
      { category: 'herb', quantity: 3_000 },
    ],
    memberTurnGoal: 1_000_000,
    perks: [{ effectType: 'craftingCrit', value: 0.15 }],
    guildXpReward: 2_000,
  },
  {
    key: 'raid_hall',
    name: 'Raid Hall',
    description: 'A war council chamber for elite combat coordination.',
    level: 3,
    prerequisites: ['barracks', 'apothecary'],
    treasuryCost: 5_000_000,
    materialCosts: [
      { category: 'leather', quantity: 5_000 },
      { category: 'ingot', quantity: 4_000 },
      { category: 'plank', quantity: 3_000 },
    ],
    memberTurnGoal: 1_000_000,
    perks: [{ effectType: 'xpBoost', value: 0.15 }],
    guildXpReward: 2_000,
  },
  {
    key: 'explorers_guild',
    name: "Explorer's Guild",
    description: 'Master explorers that command unmatched knowledge of the land.',
    level: 3,
    prerequisites: ['cartographers_lodge', 'apothecary'],
    treasuryCost: 5_000_000,
    materialCosts: [
      { category: 'plank', quantity: 5_000 },
      { category: 'herb', quantity: 4_000 },
      { category: 'cloth', quantity: 3_000 },
    ],
    memberTurnGoal: 1_000_000,
    perks: [
      { effectType: 'travelCostReduction', value: 0.30 },
      { effectType: 'gatheringYield', value: 0.15 },
    ],
    guildXpReward: 2_000,
  },
] as const;

// =============================================================================
// GUILD SPECIALIZATION
// =============================================================================

export const GUILD_SPECIALIZATION_DEFINITIONS: readonly GuildSpecializationDefinition[] = [
  {
    path: 'warfare',
    name: 'Warfare',
    description: 'Focused on combat prowess and boss encounters.',
    tiers: [
      {
        tier: 1, guildLevelGate: 10, bonuses: [
          { effectType: 'xpBoost', value: 0.05 },
          { effectType: 'combatDamage', value: 0.05 },
        ]
      },
      {
        tier: 2, guildLevelGate: 25, bonuses: [
          { effectType: 'xpBoost', value: 0.10 },
          { effectType: 'combatDamage', value: 0.10 },
        ]
      },
      {
        tier: 3, guildLevelGate: 40, bonuses: [
          { effectType: 'xpBoost', value: 0.15 },
          { effectType: 'combatDamage', value: 0.15 },
          { effectType: 'defenseBoost', value: 0.05 },
        ]
      },
    ],
  },
  {
    path: 'industry',
    name: 'Industry',
    description: 'Focused on crafting excellence and gathering efficiency.',
    tiers: [
      {
        tier: 1, guildLevelGate: 10, bonuses: [
          { effectType: 'craftingCrit', value: 0.05 },
          { effectType: 'gatheringYield', value: 0.10 },
        ]
      },
      {
        tier: 2, guildLevelGate: 25, bonuses: [
          { effectType: 'craftingCrit', value: 0.10 },
          { effectType: 'gatheringYield', value: 0.20 },
          { effectType: 'repairCostReduction', value: 0.10 },
        ]
      },
      {
        tier: 3, guildLevelGate: 40, bonuses: [
          { effectType: 'craftingCrit', value: 0.15 },
          { effectType: 'gatheringYield', value: 0.30 },
          { effectType: 'repairCostReduction', value: 0.20 },
        ]
      },
    ],
  },
  {
    path: 'discovery',
    name: 'Discovery',
    description: 'Focused on exploration and resource acquisition.',
    tiers: [
      {
        tier: 1, guildLevelGate: 10, bonuses: [
          { effectType: 'travelCostReduction', value: 0.10 },
          { effectType: 'gatheringYield', value: 0.15 },
        ]
      },
      {
        tier: 2, guildLevelGate: 25, bonuses: [
          { effectType: 'travelCostReduction', value: 0.20 },
          { effectType: 'gatheringYield', value: 0.30 },
        ]
      },
      {
        tier: 3, guildLevelGate: 40, bonuses: [
          { effectType: 'travelCostReduction', value: 0.30 },
          { effectType: 'gatheringYield', value: 0.50 },
        ]
      },
    ],
  },
] as const;

// =============================================================================
// CASINO
// =============================================================================

export const CASINO_CONSTANTS = {
  GOLD_EXCHANGE_RATE: 1,
  ROULETTE_MIN_BET: 1,
  ROULETTE_MAX_BET: 1000,
  ROULETTE_SLOTS: 37,
  ROULETTE_HISTORY_LENGTH: 20,
  ROULETTE_STATS_DEPTH: 200,
  ROUND_DURATION_SECONDS: 60,
  BETTING_WINDOW_SECONDS: 50,
  BIG_WIN_THRESHOLD: 2001,
  MAX_BETS_PER_ROUND: 12,
} as const;

// =============================================================================
// TRAINING GROUNDS
// =============================================================================

export const TRAINING_CONSTANTS = {
  COOLDOWN_SECONDS: 60,
} as const;

// =============================================================================
// QUEST SYSTEM
// =============================================================================

export const QUEST_CONSTANTS = {
  DAILY_COUNT: 3,
  WEEKLY_COUNT: 1,
  DAILY_BONUS_BASE: 5,
  DAILY_BONUS_PER_LEVEL: 0.5,
  MIN_DAILY_CATEGORIES: 2,
  REROLLS_PER_DAY: 1,
} as const;

export const QUEST_TEMPLATE_DEFINITIONS: readonly QuestTemplateDefinition[] = [
  // Daily — Combat
  { key: 'kill_mobs',       name: 'Slay Monsters',      description: 'Kill {target} monsters',                     category: 'combat',      cadence: 'daily',  progressType: 'kill_count',        targets: { low: 15, mid: 30, high: 60 },       rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  { key: 'kill_prefix',     name: 'Hunt the {prefix}',   description: 'Kill {target} {prefix} monsters',           category: 'combat',      cadence: 'daily',  progressType: 'kill_prefix',       targets: { low: 2, mid: 4, high: 8 },          rewards: { low: [5, 8], mid: [7, 10], high: [9, 12] }, filter: 'prefix', unlockCondition: 'has_prefix_kills' },
  // Daily — Exploration
  { key: 'explore_turns',   name: 'Explore the Wilds',   description: 'Spend {target} turns exploring',            category: 'exploration', cadence: 'daily',  progressType: 'exploration_turns', targets: { low: 200, mid: 500, high: 1000 },   rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  { key: 'open_chests',     name: 'Treasure Seeker',     description: 'Open {target} treasure chests',             category: 'exploration', cadence: 'daily',  progressType: 'chest_open',        targets: { low: 2, mid: 4, high: 8 },          rewards: { low: [4, 6], mid: [5, 8], high: [7, 10] } },
  { key: 'travel_zones',    name: 'Wanderer',            description: 'Travel to {target} zones',        category: 'exploration', cadence: 'daily',  progressType: 'zone_travel',       targets: { low: 2, mid: 3, high: 5 },          rewards: { low: [3, 4], mid: [4, 5], high: [5, 6] }, unlockCondition: 'multi_zone' },
  // Daily — Gathering
  { key: 'gather_resources', name: 'Resource Run',       description: 'Gather resources {target} times',           category: 'gathering',   cadence: 'daily',  progressType: 'gather_actions',    targets: { low: 15, mid: 30, high: 60 },       rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  // Daily — Crafting
  { key: 'craft_items',     name: 'Busy Hands',          description: 'Craft {target} items',                      category: 'crafting',    cadence: 'daily',  progressType: 'craft_items',       targets: { low: 8, mid: 15, high: 25 },        rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] } },
  // Daily — PvP
  { key: 'pvp_wins',        name: 'Arena Victor',        description: 'Win {target} arena fights',                 category: 'pvp',         cadence: 'daily',  progressType: 'pvp_wins',          targets: { low: 2, mid: 3, high: 5 },          rewards: { low: [5, 7], mid: [6, 8], high: [8, 10] }, unlockCondition: 'pvp_unlocked' },
  { key: 'pvp_damage',      name: 'Arena Brawler',       description: 'Deal {target} damage in the arena',         category: 'pvp',         cadence: 'daily',  progressType: 'pvp_damage',        targets: { low: 300, mid: 800, high: 2000 },   rewards: { low: [4, 6], mid: [5, 7], high: [6, 8] }, unlockCondition: 'pvp_unlocked' },
  // Daily — Casino
  { key: 'casino_wager',    name: 'High Roller',         description: 'Wager {target} gold at the casino',         category: 'casino',      cadence: 'daily',  progressType: 'casino_wagers',     targets: { low: 100, mid: 500, high: 2000 },   rewards: { low: [3, 5], mid: [4, 6], high: [6, 8] }, unlockCondition: 'casino_accessible' },
  { key: 'casino_bets',     name: 'Gambler',             description: 'Place {target} bets at the casino',         category: 'casino',      cadence: 'daily',  progressType: 'casino_bets',       targets: { low: 5, mid: 12, high: 25 },        rewards: { low: [3, 4], mid: [4, 5], high: [5, 6] }, unlockCondition: 'casino_accessible' },
  // Weekly
  { key: 'weekly_kills',    name: 'Weekly Bounty',       description: 'Kill {target} monsters this week',          category: 'combat',      cadence: 'weekly', progressType: 'kill_count',        targets: { low: 75, mid: 200, high: 500 },     rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
  { key: 'weekly_gather',   name: 'Stockpile',           description: 'Gather resources {target} times this week', category: 'gathering',   cadence: 'weekly', progressType: 'gather_actions',    targets: { low: 75, mid: 200, high: 400 },     rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
  { key: 'weekly_explore',  name: 'Cartographer',        description: 'Spend {target} turns exploring this week',  category: 'exploration', cadence: 'weekly', progressType: 'exploration_turns', targets: { low: 1000, mid: 3000, high: 8000 }, rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
  { key: 'weekly_craft',    name: 'Quality Crafter',     description: 'Craft {target} rare+ items this week',      category: 'crafting',    cadence: 'weekly', progressType: 'craft_rare',        targets: { low: 2, mid: 5, high: 10 },         rewards: { low: [15, 20], mid: [18, 25], high: [22, 30] } },
] as const;

// =============================================================================
// FRIENDS
// =============================================================================

export const FRIEND_CONSTANTS = {
  MAX_FRIENDS: 50,
  MAX_PENDING_REQUESTS: 20,
  REQUEST_COOLDOWN_SECONDS: 60,
} as const;

// =============================================================================
// SPARRING
// =============================================================================

export const SPAR_CONSTANTS = {
  TURN_COST: 200,
} as const;

// =============================================================================
// MAIL
// =============================================================================

export const MAIL_CONSTANTS = {
  GOLD_COST: 25,
  MAX_SUBJECT_LENGTH: 100,
  MAX_BODY_LENGTH: 1000,
  MAX_INBOX_SIZE: 100,
  MAX_SENT_SIZE: 50,
} as const;

// =============================================================================
// EXPEDITIONS
// =============================================================================

export const EXPEDITION_CONSTANTS = {
  TREASURY_COST_BY_TIER: [200_000, 500_000, 1_000_000] as const,
  LEVEL_REQUIREMENT_BY_TIER: [10, 16, 23] as const,
  MIN_PARTICIPANTS_BY_TIER: [5, 8, 12] as const,
  ROOMS_BY_TIER: [5, 6, 8] as const,
  MOB_COUNTS: {
    trash: [4, 5] as const,
    elite: [3, 4] as const,
    mini_boss_adds: [2, 3] as const,
    event: [3, 4] as const,
  } as const,
  SIGNUP_WINDOW_MS: 10 * 60 * 1000,
  ROUND_INTERVAL_BY_ROOM_TYPE: {
    trash: 2 * 60 * 1000,
    elite: 2 * 60 * 1000,
    mini_boss: 3 * 60 * 1000,
    event: 2 * 60 * 1000,
    final_boss: 3 * 60 * 1000,
  } as Record<'trash' | 'elite' | 'mini_boss' | 'event' | 'final_boss', number>,
  REST_DURATION_MS: 5 * 60 * 1000,
  REST_HP_REGEN: 0.20,
  REST_STAMINA_REGEN: 0.30,
  REST_MANA_REGEN: 0.30,
  EVENT_DOT_PERCENT: 0.03,
  WEEKLY_COOLDOWN_MS: 7 * 24 * 60 * 60 * 1000,
  BETWEEN_EXPEDITION_COOLDOWN_MS: 18 * 60 * 60 * 1000,
  SIGNUP_TURN_COST: 300,
  TOKENS_PER_ROOM: {
    trash: 5,
    elite: 8,
    mini_boss: 12,
    event: 8,
    final_boss: 20,
  } as const,
  TOKEN_TIER_MULTIPLIER: [1, 2, 4] as const,
  COMPLETION_BONUS_MULTIPLIER: 1.0,
  LOOT_MULTIPLIER: {
    trash: 1.0,
    elite: 1.5,
    mini_boss: 2.0,
    event: 1.5,
    final_boss: 3.0,
  } as const,
  GUILD_XP_PER_ROOM: 25,
  GUILD_XP_COMPLETION_BONUS: 100,
  KO_RECOVERY_TURN_COST: 500,
  BOSS_PHASE_THRESHOLDS: [0.50, 0.25] as const,
  SOULBOUND_DURABILITY_MULTIPLIER: 2,
  MAX_ATTEMPTS: 3,
  MAX_TOTAL_SUMMONS: 8,
  AUTO_RESOLVE_TOKEN_BONUS_PERCENT: 0.25,
  AUTO_RESOLVE_MAX_ROUNDS: 100,
} as const;

export const BESTIARY_UNLOCK_CONSTANTS = {
  DISCOVERED_THRESHOLD: 1,
  STATS_THRESHOLD: 3,
  ROTATION_THRESHOLD: 5,
} as const;

export const EXPEDITION_TOKEN_CONSTANTS = {
  TOKEN_COST_HEAD: 80,
  TOKEN_COST_CHEST: 120,
  TOKEN_COST_GLOVES: 60,
  TOKEN_COST_LEGS: 100,
  TOKEN_COST_BOOTS: 60,
  SET_BONUS_GROUP_CONTENT_ONLY: true,
} as const;
