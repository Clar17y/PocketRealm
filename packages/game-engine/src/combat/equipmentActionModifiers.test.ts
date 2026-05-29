import { describe, expect, it } from 'vitest';
import type { ActionDefinition, CombatTemplateSlotData, EquipmentActionModifier } from '@pocketrealm/shared';
import { applyEquipmentActionModifiers } from './equipmentActionModifiers';
import { resolveAction } from './actionResolver';

describe('applyEquipmentActionModifiers', () => {
  it('matching family applies modifier', () => {
    const action = actionDefinition({
      id: 'normal_attack',
      actionType: 'normal_attack',
      damageMultiplier: 1,
      accuracyModifier: 2,
    });

    const result = applyEquipmentActionModifiers({
      action,
      modifiers: [
        modifier({
          actionTypes: ['normal_attack'],
          benefits: [
            { stat: 'damage', value: 0.15, isPercent: true },
            { stat: 'accuracy', value: 0.05, isPercent: true },
          ],
          drawbacks: [{ stat: 'durabilityWear', value: 0.1, isPercent: true }],
        }),
      ],
    });

    expect(result.damageMultiplier).toBeCloseTo(1.15);
    expect(result.accuracyModifier).toBe(7);
    expect(result.durabilityWearMultiplier).toBeCloseTo(1.1);
  });

  it('named action id applies modifier', () => {
    const action = actionDefinition({
      id: 'power_strike',
      actionType: 'skill_attack',
      damageMultiplier: 1.25,
    });

    const result = applyEquipmentActionModifiers({
      action,
      modifiers: [
        modifier({
          actionTypes: [],
          actionIds: ['power_strike'],
          benefits: [{ stat: 'damage', value: 0.2, isPercent: true }],
          drawbacks: [],
        }),
      ],
    });

    expect(result.damageMultiplier).toBeCloseTo(1.5);
  });

  it('non-matching action receives no modifier', () => {
    const action = actionDefinition({
      id: 'normal_attack',
      actionType: 'normal_attack',
      damageMultiplier: 1,
      cost: { stamina: 20, mana: 0 },
    });

    const result = applyEquipmentActionModifiers({
      action,
      modifiers: [
        modifier({
          actionTypes: ['damage_spell'],
          benefits: [
            { stat: 'damage', value: 0.5, isPercent: true },
            { stat: 'resourceCost', value: -0.5, isPercent: true },
          ],
          drawbacks: [],
        }),
      ],
    });

    expect(result).toEqual(action);
    expect(result).not.toBe(action);
  });

  it('stamina and mana cost changes apply before affordability checks', () => {
    const expensiveSpell = actionDefinition({
      id: 'expensive_spell',
      actionType: 'damage_spell',
      cost: { stamina: 20, mana: 10 },
    });
    const discountedSpell = applyEquipmentActionModifiers({
      action: expensiveSpell,
      modifiers: [
        modifier({
          actionTypes: ['damage_spell'],
          benefits: [{ stat: 'resourceCost', value: -0.5, isPercent: true }],
          drawbacks: [],
        }),
      ],
    });
    const slots: CombatTemplateSlotData[] = [{ id: 'slot-1', sortOrder: 0, actionId: 'expensive_spell' }];

    const withoutModifier = resolveAction(
      slots,
      1,
      100,
      100,
      10,
      100,
      5,
      100,
      [],
      'combatantA',
      { expensive_spell: expensiveSpell },
    );
    const withModifier = resolveAction(
      slots,
      1,
      100,
      100,
      10,
      100,
      5,
      100,
      [],
      'combatantA',
      { expensive_spell: discountedSpell },
    );

    expect(discountedSpell.cost).toEqual({ stamina: 10, mana: 5 });
    expect(withoutModifier.wasExhausted).toBe(true);
    expect(withModifier.wasExhausted).toBe(false);
    expect(withModifier.action.id).toBe('expensive_spell');
  });

  it('defence, dodge, and healing modifiers alter defensive and support actions', () => {
    const reinforcedDefend = applyEquipmentActionModifiers({
      action: actionDefinition({
        id: 'defend',
        actionType: 'defend',
        category: 'defensive',
        damageReductionPercent: 0.35,
      }),
      modifiers: [
        modifier({
          actionTypes: ['defend'],
          benefits: [
            { stat: 'defence', value: 0.05, isPercent: true },
            { stat: 'dodge', value: 0.04, isPercent: true },
          ],
          drawbacks: [],
        }),
      ],
    });

    const fortifiedBuff = applyEquipmentActionModifiers({
      action: actionDefinition({
        id: 'fortify',
        actionType: 'buff',
        category: 'defensive',
        effect: { name: 'Fortified', stat: 'defence', modifier: 20, duration: 3 },
      }),
      modifiers: [
        modifier({
          actionTypes: ['buff'],
          benefits: [{ stat: 'defence', value: 0.05, isPercent: true }],
          drawbacks: [],
        }),
      ],
    });

    const strongerHeal = applyEquipmentActionModifiers({
      action: actionDefinition({
        id: 'minor_heal',
        actionType: 'heal_self',
        category: 'supportive',
        healFlat: 10,
        healPercent: 0.2,
      }),
      modifiers: [
        modifier({
          actionTypes: ['heal_self'],
          benefits: [{ stat: 'healing', value: 0.1, isPercent: true }],
          drawbacks: [],
        }),
      ],
    });

    expect(reinforcedDefend.damageReductionPercent).toBeCloseTo(0.3675);
    expect((reinforcedDefend as { avoidanceModifier?: number }).avoidanceModifier).toBe(4);
    expect(fortifiedBuff.damageReductionPercent).toBeUndefined();
    expect(fortifiedBuff.effect?.modifier).toBe(21);
    expect(strongerHeal.healFlat).toBe(11);
    expect(strongerHeal.healPercent).toBeCloseTo(0.22);
  });

  it('input action is not mutated', () => {
    const action = actionDefinition({
      id: 'heavy_attack',
      actionType: 'heavy_attack',
      damageMultiplier: 1.5,
      cost: { stamina: 40, mana: 0 },
    });
    const original = structuredClone(action);

    const result = applyEquipmentActionModifiers({
      action,
      modifiers: [
        modifier({
          actionTypes: ['heavy_attack'],
          benefits: [
            { stat: 'damage', value: 0.1, isPercent: true },
            { stat: 'resourceCost', value: -0.25, isPercent: true },
          ],
          drawbacks: [],
        }),
      ],
    });

    expect(action).toEqual(original);
    expect(result).not.toBe(action);
    expect(result.cost).not.toBe(action.cost);
  });
});

function actionDefinition(overrides: Partial<ActionDefinition>): ActionDefinition {
  return {
    id: 'test_action',
    name: 'Test Action',
    description: 'Test action.',
    actionType: 'normal_attack',
    category: 'offensive',
    cost: { stamina: 0, mana: 0 },
    ...overrides,
  };
}

function modifier(overrides: Partial<EquipmentActionModifier>): EquipmentActionModifier {
  return {
    modifierId: 'test_modifier',
    equipmentSlots: ['main_hand'],
    actionTypes: [],
    benefits: [],
    drawbacks: [],
    ...overrides,
  };
}
