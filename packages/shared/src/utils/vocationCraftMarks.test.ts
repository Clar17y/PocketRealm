import { describe, expect, it } from 'vitest';
import { getEquipmentActionModifiers, parseCraftMarks } from './vocationCraftMarks';

describe('parseCraftMarks', () => {
  it('parses valid persisted mark arrays', () => {
    const marks = parseCraftMarks([
      {
        markId: 'keen_edge_mark',
        name: 'Keen Edge Mark',
        sourceTechniqueId: 'weaponsmith_keen_edge',
        description: 'A clean edge that favours precise strikes.',
        itemStatBenefits: [{ stat: 'attack', value: 0.05, isPercent: true }],
        itemStatDrawbacks: [{ stat: 'dodge', value: -0.02, isPercent: true }],
        actionModifiers: [
          {
            modifierId: 'keen_edge_light_attacks',
            equipmentSlots: ['main_hand'],
            actionTypes: ['light_attack'],
            benefits: [{ stat: 'damage', value: 0.1, isPercent: true }],
            drawbacks: [{ stat: 'resourceCost', value: 0.05, isPercent: true }],
          },
        ],
      },
    ]);

    expect(marks).toEqual([
      {
        markId: 'keen_edge_mark',
        name: 'Keen Edge Mark',
        sourceTechniqueId: 'weaponsmith_keen_edge',
        description: 'A clean edge that favours precise strikes.',
        itemStatBenefits: [{ stat: 'attack', value: 0.05, isPercent: true }],
        itemStatDrawbacks: [{ stat: 'dodge', value: -0.02, isPercent: true }],
        actionModifiers: [
          {
            modifierId: 'keen_edge_light_attacks',
            equipmentSlots: ['main_hand'],
            actionTypes: ['light_attack'],
            benefits: [{ stat: 'damage', value: 0.1, isPercent: true }],
            drawbacks: [{ stat: 'resourceCost', value: 0.05, isPercent: true }],
          },
        ],
      },
    ]);
  });

  it('ignores malformed entries', () => {
    const marks = parseCraftMarks([
      null,
      {
        markId: 'missing_name',
        sourceTechniqueId: 'weaponsmith_keen_edge',
        description: 'Missing required metadata.',
      },
      {
        markId: 'bad_action_modifier',
        name: 'Bad Action Modifier',
        sourceTechniqueId: 'weaponsmith_keen_edge',
        description: 'Contains malformed modifier data.',
        actionModifiers: [{ modifierId: 'bad', equipmentSlots: ['main_hand'] }],
      },
      {
        markId: 'valid_empty_mark',
        name: 'Valid Empty Mark',
        sourceTechniqueId: 'weaponsmith_keen_edge',
        description: 'No optional arrays are required.',
      },
    ]);

    expect(marks).toHaveLength(1);
    expect(marks[0]?.markId).toBe('valid_empty_mark');
  });
});

describe('getEquipmentActionModifiers', () => {
  it('filters action modifiers by equipped slot', () => {
    const marks = parseCraftMarks([
      persistedMark({
        actionModifiers: [
          modifier('main_hand_modifier', ['main_hand'], ['normal_attack']),
          modifier('off_hand_modifier', ['off_hand'], ['normal_attack']),
        ],
      }),
    ]);

    expect(getEquipmentActionModifiers({ slot: 'main_hand', craftMarks: marks })).toEqual([
      modifier('main_hand_modifier', ['main_hand'], ['normal_attack']),
    ]);
  });

  it('ignores modifiers that target unknown action families or ids', () => {
    const marks = parseCraftMarks([
      persistedMark({
        actionModifiers: [
          modifier('known_family', ['main_hand'], ['normal_attack']),
          modifier('unknown_family', ['main_hand'], ['not_an_action']),
          {
            ...modifier('known_named_action', ['main_hand'], []),
            actionIds: ['power_strike'],
          },
          {
            ...modifier('unknown_named_action', ['main_hand'], []),
            actionIds: ['missing_action'],
          },
        ],
      }),
    ]);

    expect(getEquipmentActionModifiers({ slot: 'main_hand', craftMarks: marks }).map((m) => m.modifierId)).toEqual([
      'known_family',
      'known_named_action',
    ]);
  });
});

function persistedMark(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    markId: 'keen_edge_mark',
    name: 'Keen Edge Mark',
    sourceTechniqueId: 'weaponsmith_keen_edge',
    description: 'A clean edge that favours precise strikes.',
    itemStatBenefits: [],
    itemStatDrawbacks: [],
    actionModifiers: [],
    ...overrides,
  };
}

function modifier(
  modifierId: string,
  equipmentSlots: readonly string[],
  actionTypes: readonly string[],
): Record<string, unknown> {
  return {
    modifierId,
    equipmentSlots,
    actionTypes,
    benefits: [{ stat: 'damage', value: 0.1, isPercent: true }],
    drawbacks: [{ stat: 'resourceCost', value: 0.05, isPercent: true }],
  };
}
