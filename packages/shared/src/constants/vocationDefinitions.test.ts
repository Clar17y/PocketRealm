import { describe, expect, it } from 'vitest';
import {
  VOCATION_DEFINITIONS,
  VOCATION_IDS,
  assertValidVocationDefinitions,
  getTechniqueDefinition,
  getVocationDefinition,
} from './vocationDefinitions';
import type { VocationTechniqueDefinition } from '../types/vocation.types';

const GENERIC_PERK_IDS = new Set([
  'efficiency',
  'yield',
  'quality',
  'costReduction',
  'specialization',
]);

const FORBIDDEN_GENERIC_EFFECT_TYPES = new Set([
  'craft_stat_bonus',
  'craft_durability_bonus',
  'craft_turn_discount',
  'gather_amount_bonus',
  'gather_rare_find_bonus',
  'gather_turn_discount',
  'gather_node_discovery_bonus',
  'passive_craft_xp_bonus',
  'passive_gather_xp_bonus',
]);

const CONCRETE_GATHERING_EFFECT_TYPES = new Set([
  'preserve_node_capacity_chance',
  'node_state_turn_discount',
  'repeat_node_turn_discount',
  'crit_chance_delta',
  'tool_durability_loss_multiplier',
  'inventory_pressure_yield_rule',
]);

describe('vocationDefinitions', () => {
  it('defines every launch vocation', () => {
    expect(VOCATION_IDS).toEqual([
      'prospector',
      'forester',
      'herbalist',
      'weaponsmith',
      'bowyer',
      'staffwright',
      'armorer',
      'leatherworker',
      'tailor',
      'jeweller',
      'alchemist',
    ]);

    for (const vocationId of VOCATION_IDS) {
      expect(getVocationDefinition(vocationId)?.id).toBe(vocationId);
    }
  });

  it('gives every vocation at least two branches and six techniques', () => {
    for (const vocation of VOCATION_DEFINITIONS) {
      expect(vocation.branches.length, `${vocation.id} branch count`).toBeGreaterThanOrEqual(2);
      expect(vocation.techniques.length, `${vocation.id} technique count`).toBeGreaterThanOrEqual(6);
    }
  });

  it('uses globally unique technique IDs', () => {
    const techniqueIds = VOCATION_DEFINITIONS.flatMap((vocation) =>
      vocation.techniques.map((technique) => technique.id),
    );

    expect(new Set(techniqueIds).size).toBe(techniqueIds.length);
  });

  it('keeps each technique attached to its vocation and branch', () => {
    for (const vocation of VOCATION_DEFINITIONS) {
      const branchIds = new Set(vocation.branches.map((branch) => branch.id));

      for (const technique of vocation.techniques) {
        expect(technique.vocationId, `${technique.id} vocation`).toBe(vocation.id);
        expect(branchIds.has(technique.branchId), `${technique.id} branch`).toBe(true);
        expect(getTechniqueDefinition(technique.id)).toBe(technique);
      }
    }
  });

  it('defines requirements, costs, rules, and effects for every technique', () => {
    for (const technique of allTechniques()) {
      expect(technique.requiredRank, `${technique.id} rank`).toBeGreaterThanOrEqual(1);
      expect(technique.pointCost, `${technique.id} point cost`).toBeGreaterThanOrEqual(1);
      expect(technique.applicationRule, `${technique.id} application rule`).toBeDefined();
      expect(technique.effects.length, `${technique.id} effects`).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not use generic perk IDs for techniques or effects', () => {
    for (const technique of allTechniques()) {
      expect(GENERIC_PERK_IDS.has(technique.id), `${technique.id} technique id`).toBe(false);

      for (const effect of technique.effects) {
        expect(GENERIC_PERK_IDS.has(effect.type), `${technique.id} effect type`).toBe(false);
        expect(FORBIDDEN_GENERIC_EFFECT_TYPES.has(effect.type), `${technique.id} generic effect type`).toBe(false);
        if ('modifierId' in effect) {
          expect(GENERIC_PERK_IDS.has(effect.modifierId), `${technique.id} modifier id`).toBe(false);
        }
        if ('mark' in effect) {
          expect(GENERIC_PERK_IDS.has(effect.mark.markId), `${technique.id} craft mark id`).toBe(false);
        }
      }
    }
  });

  it('uses concrete gathering mechanics instead of renamed yield bonuses', () => {
    for (const technique of allTechniques().filter((candidate) => candidate.applicationRule.type === 'gathering')) {
      for (const effect of technique.effects) {
        expect(
          CONCRETE_GATHERING_EFFECT_TYPES.has(effect.type),
          `${technique.id} gathering effect ${effect.type}`,
        ).toBe(true);
      }
    }
  });

  it('gives every craft mark visible metadata and a tradeoff', () => {
    for (const technique of allTechniques()) {
      for (const effect of technique.effects) {
        if (effect.type !== 'craft_mark') {
          continue;
        }

        expect(effect.mark.markId, `${technique.id} mark id`).toContain(`${technique.id}_`);
        expect(effect.mark.name, `${technique.id} mark name`).not.toHaveLength(0);
        expect(effect.mark.description, `${technique.id} mark description`).not.toHaveLength(0);
        expect(effect.mark.itemStatBenefits.length, `${technique.id} mark benefits`).toBeGreaterThan(0);
        expect(effect.mark.itemStatDrawbacks.length, `${technique.id} mark drawbacks`).toBeGreaterThan(0);
      }
    }
  });

  it('keeps craft mark scope within the technique craft application rule', () => {
    for (const technique of allTechniques()) {
      if (technique.applicationRule.type !== 'craft') {
        continue;
      }

      for (const effect of technique.effects) {
        if (effect.type !== 'craft_mark') {
          continue;
        }

        expect(
          effect.mark.allowedItemTypes.every((itemType) => technique.applicationRule.itemTypes.includes(itemType)),
          `${technique.id} mark item type scope`,
        ).toBe(true);

        if (technique.applicationRule.equipmentSlots) {
          expect(effect.mark.allowedSlots, `${technique.id} mark slot scope`).toBeDefined();
          expect(
            effect.mark.allowedSlots?.every((slot) => technique.applicationRule.equipmentSlots?.includes(slot)),
            `${technique.id} mark slot scope`,
          ).toBe(true);
        } else {
          expect(effect.mark.allowedSlots, `${technique.id} mark slot scope`).toBeUndefined();
        }
      }
    }
  });

  it('uses resource-specific gathering crit types', () => {
    const expectedCritTypesByResource = new Map([
      ['gem', 'gem_crit'],
      ['resin', 'resin_pocket'],
      ['wood', 'heartwood'],
      ['herb', 'rare_botanical'],
      ['root', 'rare_botanical'],
    ]);

    for (const technique of allTechniques()) {
      if (technique.applicationRule.type !== 'gathering') {
        continue;
      }

      for (const effect of technique.effects) {
        if (effect.type !== 'crit_chance_delta') {
          continue;
        }

        const expectedCritTypes = technique.applicationRule.resourceCategories
          .map((resourceCategory) => expectedCritTypesByResource.get(resourceCategory))
          .filter((critType): critType is NonNullable<typeof critType> => Boolean(critType));

        expect(expectedCritTypes, `${technique.id} expected crit type`).toContain(effect.critType);
      }
    }
  });

  it('requires action modifier benefits to carry explicit drawbacks', () => {
    for (const technique of allTechniques()) {
      for (const effect of technique.effects) {
        if (effect.type !== 'equipment_action_modifier') {
          continue;
        }

        expect(effect.benefits.length, `${technique.id} action benefits`).toBeGreaterThan(0);
        expect(effect.drawbacks.length, `${technique.id} action drawbacks`).toBeGreaterThan(0);
      }
    }
  });

  it('passes built-in definition validation', () => {
    expect(() => assertValidVocationDefinitions()).not.toThrow();
  });
});

function allTechniques(): VocationTechniqueDefinition[] {
  return VOCATION_DEFINITIONS.flatMap((vocation) => vocation.techniques);
}
