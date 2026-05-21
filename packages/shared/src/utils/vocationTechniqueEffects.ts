import { VOCATION_DEFINITIONS } from '../constants/vocationDefinitions';
import type {
  CraftMarkDefinition,
  CraftTechniqueEffect,
  GatheringTechniqueEffect,
  VocationId,
  VocationTechniqueDefinition,
} from '../types/vocation.types';

export interface CraftTechniqueApplication {
  turnCostMultiplier: number;
  materialCostMultiplier: number;
  outputQuantityDelta: number;
  craftMarks: CraftMarkDefinition[];
  critRules: Extract<CraftTechniqueEffect, { type: 'craft_crit_rule' }>[];
  appliedEffectIds: string[];
}

export interface GatheringTechniqueApplication {
  turnCostMultiplier: number;
  outputQuantityDelta: number;
  capacityPreserveChance: number;
  critChanceDeltas: Array<{
    critType: Extract<GatheringTechniqueEffect, { type: 'crit_chance_delta' }>['critType'];
    value: number;
    condition: string;
  }>;
  toolDurabilityLossMultiplier: number;
  inventoryPressureRules: Extract<GatheringTechniqueEffect, { type: 'inventory_pressure_yield_rule' }>[];
  appliedEffectIds: string[];
}

export function getEligibleTechniquesForCraft(input: {
  vocationId: VocationId;
  learnedTechniqueIds: readonly string[];
  recipeId?: string;
  skillType: string;
  resultItemType?: string | null;
  resultSlot?: string | null;
  resultRarity?: string | null;
}): VocationTechniqueDefinition[] {
  const learnedTechniqueIds = new Set(input.learnedTechniqueIds);

  return getVocationTechniques(input.vocationId).filter((technique) => {
    if (!learnedTechniqueIds.has(technique.id) || technique.applicationRule.type !== 'craft') {
      return false;
    }

    const rule = technique.applicationRule;
    if (rule.skill !== input.skillType) {
      return false;
    }
    if (!input.resultItemType || !includesString(rule.itemTypes, input.resultItemType)) {
      return false;
    }
    if (!rule.equipmentSlots) {
      return true;
    }
    if (!input.resultSlot) {
      return false;
    }

    return includesString(rule.equipmentSlots, input.resultSlot);
  });
}

export function getEligibleTechniquesForGathering(input: {
  vocationId: VocationId;
  learnedTechniqueIds: readonly string[];
  skillType: string;
  resourceCategory?: string | null;
}): VocationTechniqueDefinition[] {
  const learnedTechniqueIds = new Set(input.learnedTechniqueIds);

  return getVocationTechniques(input.vocationId).filter((technique) => {
    if (!learnedTechniqueIds.has(technique.id) || technique.applicationRule.type !== 'gathering') {
      return false;
    }

    const rule = technique.applicationRule;
    if (rule.skill !== input.skillType) {
      return false;
    }
    if (!input.resourceCategory) {
      return rule.resourceCategories.length === 0;
    }

    return rule.resourceCategories.includes(input.resourceCategory);
  });
}

export function applyCraftTechniqueEffects(
  technique: VocationTechniqueDefinition | null | undefined,
): CraftTechniqueApplication {
  const application: CraftTechniqueApplication = {
    turnCostMultiplier: 1,
    materialCostMultiplier: 1,
    outputQuantityDelta: 0,
    craftMarks: [],
    critRules: [],
    appliedEffectIds: [],
  };

  if (!technique) {
    return application;
  }

  for (const effect of technique.effects) {
    if (effect.type === 'craft_flow_modifier') {
      application.turnCostMultiplier *= effect.turnCostMultiplier ?? 1;
      application.materialCostMultiplier *= effect.materialCostMultiplier ?? 1;
      application.outputQuantityDelta += effect.outputQuantityDelta ?? 0;
      application.appliedEffectIds.push(effect.ruleId);
    } else if (effect.type === 'craft_mark') {
      application.craftMarks.push(effect.mark);
      application.appliedEffectIds.push(effect.mark.markId);
    } else if (effect.type === 'craft_crit_rule') {
      application.critRules.push(effect);
      application.appliedEffectIds.push(effect.ruleId);
    }
  }

  return application;
}

export function applyGatheringTechniqueEffects(
  technique: VocationTechniqueDefinition | null | undefined,
): GatheringTechniqueApplication {
  const application: GatheringTechniqueApplication = {
    turnCostMultiplier: 1,
    outputQuantityDelta: 0,
    capacityPreserveChance: 0,
    critChanceDeltas: [],
    toolDurabilityLossMultiplier: 1,
    inventoryPressureRules: [],
    appliedEffectIds: [],
  };

  if (!technique) {
    return application;
  }

  for (const effect of technique.effects) {
    if (effect.type === 'preserve_node_capacity_chance') {
      application.capacityPreserveChance += effect.chance;
      application.appliedEffectIds.push(effect.type);
    } else if (effect.type === 'node_state_turn_discount') {
      application.turnCostMultiplier *= effect.turnCostMultiplier;
      application.appliedEffectIds.push(effect.type);
    } else if (effect.type === 'repeat_node_turn_discount') {
      application.turnCostMultiplier *= effect.turnCostMultiplier;
      application.appliedEffectIds.push(effect.type);
    } else if (effect.type === 'crit_chance_delta') {
      application.critChanceDeltas.push({
        critType: effect.critType,
        value: effect.value,
        condition: effect.condition,
      });
      application.appliedEffectIds.push(effect.critType);
    } else if (effect.type === 'tool_durability_loss_multiplier') {
      application.toolDurabilityLossMultiplier *= effect.multiplier;
      application.appliedEffectIds.push(effect.type);
    } else if (effect.type === 'inventory_pressure_yield_rule') {
      application.outputQuantityDelta += effect.outputQuantityDelta;
      application.inventoryPressureRules.push(effect);
      application.appliedEffectIds.push(effect.type);
    }
  }

  application.capacityPreserveChance = clampChance(application.capacityPreserveChance);

  return application;
}

function getVocationTechniques(vocationId: VocationId): readonly VocationTechniqueDefinition[] {
  return VOCATION_DEFINITIONS.find((definition) => definition.id === vocationId)?.techniques ?? [];
}

function clampChance(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function includesString(values: readonly string[], value: string): boolean {
  return values.includes(value);
}
