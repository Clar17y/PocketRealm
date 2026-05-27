import { describe, expect, it } from 'vitest';
import type {
  GatheringTechniqueEffect,
  VocationTechniqueDefinition,
} from '../types/vocation.types';
import {
  applyCraftTechniqueEffects,
  applyGatheringTechniqueEffects,
  getEligibleTechniquesForCraft,
  getEligibleTechniquesForGathering,
} from './vocationTechniqueEffects';

describe('vocationTechniqueEffects selectors', () => {
  it('returns only learned craft techniques for the requested vocation and craft context', () => {
    const techniques = getEligibleTechniquesForCraft({
      vocationId: 'alchemist',
      learnedTechniqueIds: ['alchemist_strong_extract', 'alchemist_mortar_rhythm', 'weaponsmith_keen_edge'],
      skillType: 'alchemy',
      resultItemType: 'consumable',
    });

    expect(techniques.map((technique) => technique.id)).toEqual([
      'alchemist_strong_extract',
      'alchemist_mortar_rhythm',
    ]);
  });

  it('excludes craft techniques for the wrong vocation, skill, item type, or missing slot', () => {
    expect(getEligibleTechniquesForCraft({
      vocationId: 'weaponsmith',
      learnedTechniqueIds: ['weaponsmith_keen_edge'],
      skillType: 'alchemy',
      resultItemType: 'weapon',
      resultSlot: 'main_hand',
    })).toEqual([]);

    expect(getEligibleTechniquesForCraft({
      vocationId: 'weaponsmith',
      learnedTechniqueIds: ['weaponsmith_keen_edge'],
      skillType: 'weaponsmithing',
      resultItemType: 'armor',
      resultSlot: 'main_hand',
    })).toEqual([]);

    expect(getEligibleTechniquesForCraft({
      vocationId: 'weaponsmith',
      learnedTechniqueIds: ['weaponsmith_keen_edge'],
      skillType: 'weaponsmithing',
      resultItemType: 'weapon',
    })).toEqual([]);
  });

  it('excludes craft techniques when the result item type is missing', () => {
    expect(getEligibleTechniquesForCraft({
      vocationId: 'alchemist',
      learnedTechniqueIds: ['alchemist_strong_extract'],
      skillType: 'alchemy',
    })).toEqual([]);
  });

  it('includes artisan action mark techniques in craft selectors but not gathering selectors', () => {
    expect(getEligibleTechniquesForCraft({
      vocationId: 'weaponsmith',
      learnedTechniqueIds: ['weaponsmith_crushing_poll'],
      skillType: 'weaponsmithing',
      resultItemType: 'weapon',
      resultSlot: 'main_hand',
    }).map((technique) => technique.id)).toEqual(['weaponsmith_crushing_poll']);

    expect(getEligibleTechniquesForGathering({
      vocationId: 'weaponsmith',
      learnedTechniqueIds: ['weaponsmith_crushing_poll'],
      skillType: 'mining',
      resourceCategory: 'ore',
    })).toEqual([]);
  });

  it('requires gathering resource categories when techniques are resource-specific', () => {
    expect(getEligibleTechniquesForGathering({
      vocationId: 'prospector',
      learnedTechniqueIds: ['prospector_clean_split', 'prospector_bright_inclusion'],
      skillType: 'mining',
      resourceCategory: 'ore',
    }).map((technique) => technique.id)).toEqual(['prospector_clean_split']);

    expect(getEligibleTechniquesForGathering({
      vocationId: 'prospector',
      learnedTechniqueIds: ['prospector_clean_split'],
      skillType: 'mining',
    })).toEqual([]);
  });
});

describe('vocationTechniqueEffects application', () => {
  it('applies craft mark definitions and craft flow tradeoff multipliers', () => {
    const application = applyCraftTechniqueEffects(craftTechnique([
      {
        type: 'craft_flow_modifier',
        ruleId: 'fast_batch',
        condition: 'batch only',
        turnCostMultiplier: 0.8,
        materialCostMultiplier: 1.25,
        outputQuantityDelta: 1,
        drawback: 'more waste',
      },
      {
        type: 'craft_mark',
        mark: {
          markId: 'precise_mark',
          name: 'Precise Mark',
          description: 'A precise maker mark.',
          allowedItemTypes: ['weapon'],
          allowedSlots: ['main_hand'],
          itemStatBenefits: [{ stat: 'accuracy', value: 0.04, isPercent: true }],
          itemStatDrawbacks: [{ stat: 'dodge', value: -0.02, isPercent: true }],
        },
      },
      {
        type: 'craft_crit_rule',
        ruleId: 'rare_finish',
        critType: 'rarity_upgrade',
        critChanceDelta: 0.05,
        condition: 'rare finish window',
        drawback: 'failed finish waste',
      },
    ]));

    expect(application).toMatchObject({
      turnCostMultiplier: 0.8,
      materialCostMultiplier: 1.3125,
      outputQuantityDelta: 1,
      appliedEffectIds: ['fast_batch', 'precise_mark', 'rare_finish'],
    });
    expect(application.craftMarks).toHaveLength(1);
    expect(application.craftMarks[0]?.markId).toBe('precise_mark');
    expect(application.critRules).toHaveLength(1);
    expect(application.critRules[0]?.critType).toBe('rarity_upgrade');
  });

  it('applies gathering effects to concrete fields without generic buckets', () => {
    const application = applyGatheringTechniqueEffects(gatheringTechnique([
      {
        type: 'preserve_node_capacity_chance',
        chance: 0.8,
        condition: 'fresh node',
      },
      {
        type: 'preserve_node_capacity_chance',
        chance: 0.4,
        condition: 'matched tool',
      },
      {
        type: 'crit_chance_delta',
        critType: 'gem_crit',
        value: 0.07,
        condition: 'gem node',
      },
      {
        type: 'tool_durability_loss_multiplier',
        multiplier: 0.85,
        condition: 'matched pick',
      },
      {
        type: 'inventory_pressure_yield_rule',
        minFreeSlots: 3,
        outputQuantityDelta: 2,
        overflowBehavior: 'skip_bonus',
      },
      {
        type: 'node_state_turn_discount',
        nodeState: 'rich',
        turnCostMultiplier: 0.9,
      },
      {
        type: 'repeat_node_turn_discount',
        repeatWindowTurns: 300,
        turnCostMultiplier: 0.95,
        maxStacks: 2,
      },
    ]));

    expect(application).toMatchObject({
      turnCostMultiplier: 0.855,
      outputQuantityDelta: 2,
      capacityPreserveChance: 1,
      toolDurabilityLossMultiplier: 0.85,
      appliedEffectIds: [
        'preserve_node_capacity_chance',
        'preserve_node_capacity_chance',
        'gem_crit',
        'tool_durability_loss_multiplier',
        'inventory_pressure_yield_rule',
        'node_state_turn_discount',
        'repeat_node_turn_discount',
      ],
    });
    expect(application.critChanceDeltas).toEqual([
      { critType: 'gem_crit', value: 0.07, condition: 'gem node' },
    ]);
    expect(application.inventoryPressureRules).toHaveLength(1);
    expect(application).not.toHaveProperty('yieldModifiers');
    expect(application).not.toHaveProperty('qualityModifiers');
    expect(application).not.toHaveProperty('efficiencyModifiers');
  });
});

function craftTechnique(effects: VocationTechniqueDefinition['effects']): VocationTechniqueDefinition {
  return {
    id: 'test_craft_technique',
    vocationId: 'weaponsmith',
    branchId: 'weaponsmith_blades',
    name: 'Test Craft Technique',
    description: 'Test only.',
    requiredRank: 1,
    pointCost: 1,
    applicationRule: {
      type: 'craft',
      skill: 'weaponsmithing',
      itemTypes: ['weapon'],
      equipmentSlots: ['main_hand'],
    },
    effects,
  };
}

function gatheringTechnique(effects: readonly GatheringTechniqueEffect[]): VocationTechniqueDefinition {
  return {
    id: 'test_gathering_technique',
    vocationId: 'prospector',
    branchId: 'prospector_veinreader',
    name: 'Test Gathering Technique',
    description: 'Test only.',
    requiredRank: 1,
    pointCost: 1,
    applicationRule: {
      type: 'gathering',
      skill: 'mining',
      resourceCategories: ['ore'],
    },
    effects,
  };
}
