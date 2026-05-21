import type { CombatActionType } from './combatAction.types';
import type { ItemRarity, ItemType } from './item.types';
import type { EquipmentSlot, SkillType } from './player.types';

export type VocationId =
  | 'prospector'
  | 'forester'
  | 'herbalist'
  | 'weaponsmith'
  | 'bowyer'
  | 'staffwright'
  | 'armorer'
  | 'leatherworker'
  | 'tailor'
  | 'jeweller'
  | 'alchemist';

export type VocationBranchId =
  | 'prospector_veinreader'
  | 'prospector_gemcutter'
  | 'forester_timberwright'
  | 'forester_resinseer'
  | 'herbalist_leafwarden'
  | 'herbalist_seedbinder'
  | 'weaponsmith_blades'
  | 'weaponsmith_hammers'
  | 'bowyer_stringcraft'
  | 'bowyer_limbcraft'
  | 'staffwright_channels'
  | 'staffwright_focuses'
  | 'armorer_plate'
  | 'armorer_mail'
  | 'leatherworker_hides'
  | 'leatherworker_stitching'
  | 'tailor_weaves'
  | 'tailor_enchantments'
  | 'jeweller_facets'
  | 'jeweller_settings'
  | 'alchemist_extracts'
  | 'alchemist_distillations';

export type VocationMentorTown = 'millbrook' | 'thornwall';

export interface VocationProgress {
  vocationId: VocationId;
  xp: number;
  rank: number;
  masteryPointsEarned: number;
  spentPoints: number;
  unlockedTechniqueIds: string[];
  dailyHoningTurnsUsed: number;
  updatedAt: string;
}

export interface PlayerVocationState {
  playerId: string;
  vocations: VocationProgress[];
  activeVocationId: VocationId | null;
}

export interface VocationSnapshot {
  vocationId: VocationId;
  rank: number;
  xp: number;
  xpForCurrentRank: number;
  xpForNextRank: number;
  masteryPointsEarned: number;
  availableMasteryPoints: number;
  unlockedTechniqueIds: string[];
}

export interface VocationStateDto {
  vocationId: VocationId;
  xp: number;
  rank: number;
  xpForCurrentRank: number;
  xpForNextRank: number;
  masteryPointsEarned: number;
  availableMasteryPoints: number;
  spentPoints: number;
  learnedTechniqueIds: string[];
}

export interface VocationDailyCapDto {
  dayStart: string;
  turnsSpent: number;
  turnsLimit: number;
  turnsRemaining: number;
}

export interface VocationSnapshotResponse {
  playerId: string;
  vocations: VocationStateDto[];
  dailyCap: VocationDailyCapDto;
}

export interface VocationBranchDefinition {
  id: VocationBranchId;
  name: string;
  description: string;
}

export interface VocationDefinition {
  id: VocationId;
  name: string;
  description: string;
  mentorTown: VocationMentorTown;
  primarySkill: SkillType;
  branches: readonly VocationBranchDefinition[];
  techniques: readonly VocationTechniqueDefinition[];
}

export interface VocationTechniqueDefinition {
  id: string;
  vocationId: VocationId;
  branchId: VocationBranchId;
  name: string;
  description: string;
  requiredRank: number;
  pointCost: number;
  applicationRule: VocationApplicationRule;
  effects: readonly VocationTechniqueEffect[];
}

export interface CraftMarkDefinition {
  markId: string;
  name: string;
  description: string;
  allowedItemTypes: readonly ItemType[];
  allowedSlots?: readonly EquipmentSlot[];
  minRarity?: ItemRarity;
  itemStatBenefits: readonly ItemStatModifier[];
  itemStatDrawbacks: readonly ItemStatModifier[];
  actionModifiers?: readonly EquipmentActionModifier[];
}

export interface CraftMark {
  markId: string;
  name: string;
  sourceTechniqueId: string;
  description: string;
  itemStatBenefits?: readonly ItemStatModifier[];
  itemStatDrawbacks?: readonly ItemStatModifier[];
  actionModifiers?: readonly EquipmentActionModifier[];
}

export interface EquipmentActionModifier {
  modifierId: string;
  equipmentSlots: readonly EquipmentSlot[];
  actionTypes: readonly CombatActionType[];
  actionIds?: readonly string[];
  benefits: readonly EquipmentActionModifierEntry[];
  drawbacks: readonly EquipmentActionModifierEntry[];
}

export interface EquipmentActionModifierEntry {
  stat: EquipmentActionModifierStat;
  value: number;
  isPercent: boolean;
}

export type EquipmentActionModifierStat =
  | 'damage'
  | 'accuracy'
  | 'defence'
  | 'dodge'
  | 'healing'
  | 'resourceCost'
  | 'durabilityWear';

export interface ItemStatModifier {
  stat: 'attack' | 'rangedPower' | 'magicPower' | 'accuracy' | 'dodge' | 'armor' | 'magicDefence' | 'health' | 'critChance' | 'critDamage' | 'luck';
  value: number;
  isPercent: boolean;
}

export type VocationApplicationRule =
  | CraftApplicationRule
  | GatheringApplicationRule
  | EquipmentActionApplicationRule;

export interface CraftApplicationRule {
  type: 'craft';
  skill: SkillType;
  itemTypes: readonly ItemType[];
  equipmentSlots?: readonly EquipmentSlot[];
}

export interface GatheringApplicationRule {
  type: 'gathering';
  skill: SkillType;
  resourceCategories: readonly string[];
}

export interface EquipmentActionApplicationRule {
  type: 'equipment_action';
  equipmentSlots: readonly EquipmentSlot[];
  actionTypes: readonly CombatActionType[];
}

export type VocationTechniqueEffect =
  | CraftTechniqueEffect
  | GatheringTechniqueEffect
  | EquipmentActionModifierEffect;

export type CraftTechniqueEffect =
  | {
      type: 'craft_flow_modifier';
      ruleId: string;
      condition: string;
      turnCostMultiplier?: number;
      materialCostMultiplier?: number;
      outputQuantityDelta?: number;
      drawback: string;
    }
  | {
      type: 'craft_mark';
      mark: CraftMarkDefinition;
    }
  | {
      type: 'craft_crit_rule';
      ruleId: string;
      critType: 'rarity_upgrade' | 'gem_setting' | 'batch_stability';
      critChanceDelta: number;
      condition: string;
      drawback: string;
    };

export type GatheringTechniqueEffect =
  | {
      type: 'preserve_node_capacity_chance';
      chance: number;
      condition: string;
    }
  | {
      type: 'node_state_turn_discount';
      nodeState: 'fresh' | 'depleted' | 'rich' | 'overgrown';
      turnCostMultiplier: number;
    }
  | {
      type: 'repeat_node_turn_discount';
      repeatWindowTurns: number;
      turnCostMultiplier: number;
      maxStacks: number;
    }
  | {
      type: 'crit_chance_delta';
      critType: 'gem_crit' | 'rare_botanical' | 'resin_pocket' | 'heartwood';
      value: number;
      condition: string;
    }
  | {
      type: 'tool_durability_loss_multiplier';
      multiplier: number;
      condition: string;
    }
  | {
      type: 'inventory_pressure_yield_rule';
      minFreeSlots: number;
      outputQuantityDelta: number;
      overflowBehavior: 'skip_bonus' | 'convert_to_common';
    };

export interface EquipmentActionModifierEffect extends EquipmentActionModifier {
  type: 'equipment_action_modifier';
}
