import { describe, expect, it, vi } from 'vitest';
import type { TalentNodeDefinition } from '@pocketrealm/shared';
import { getTemplatePickerSections } from './templatePickerActions';

describe('getTemplatePickerSections', () => {
  it('hides locked talent actions but keeps always-available actions', () => {
    const sections = getTemplatePickerSections([]);
    const visibleIds = sections.flatMap((section) => section.actions.map((action) => action.id));

    expect(visibleIds).toContain('light_attack');
    expect(visibleIds).toContain('use_hp_potion');
    expect(visibleIds).toContain('use_cleanse_potion');
    expect(visibleIds).not.toContain('power_strike');
    expect(visibleIds).not.toContain('minor_heal');
  });

  it('includes unlocked talent actions in the combat core section', () => {
    const sections = getTemplatePickerSections(['power_strike', 'minor_heal']);
    const combatCore = sections.find((section) => section.key === 'combat-core');
    const utility = sections.find((section) => section.key === 'utility');

    expect(combatCore?.title).toBe('Combat Core');
    expect(combatCore?.actions.map((action) => action.id)).toContain('power_strike');
    expect(combatCore?.actions.map((action) => action.id)).not.toContain('minor_heal');
    expect(utility?.title).toBe('Utility');
    expect(utility?.actions.map((action) => action.id)).toContain('minor_heal');
  });

  it('keeps health potions above the lower-priority utility actions', () => {
    const sections = getTemplatePickerSections(['power_strike']);

    expect(sections.map((section) => section.title)).toEqual(['Combat Core', 'Utility']);
    expect(sections[0]?.actions.map((action) => action.id)).toEqual([
      'light_attack',
      'normal_attack',
      'heavy_attack',
      'use_hp_potion',
      'power_strike',
    ]);
    expect(sections[1]?.actions.map((action) => action.id)).toEqual([
      'defend',
      'counter',
      'ward',
      'use_stamina_potion',
      'use_mana_potion',
      'use_cleanse_potion',
      'use_resist_potion',
      'use_elixir_of_power',
    ]);
  });

  it('derives unlocked talent ordering from shared talent definitions', async () => {
    const mockedTalentNodes: TalentNodeDefinition[] = [
      {
        id: 'mock_minor_heal_node',
        tree: 'magic',
        tier: 1,
        name: 'Minor Heal',
        description: 'Mock node for ordering.',
        pointCost: 1,
        prerequisites: [],
        unlocksAction: 'minor_heal',
      },
      {
        id: 'mock_power_strike_node',
        tree: 'melee',
        tier: 1,
        name: 'Power Strike',
        description: 'Mock node for ordering.',
        pointCost: 1,
        prerequisites: [],
        unlocksAction: 'power_strike',
      },
    ];

    vi.doMock('@pocketrealm/shared', async () => {
      const actual = await vi.importActual<typeof import('@pocketrealm/shared')>('@pocketrealm/shared');
      return {
        ...actual,
        getAllTalentNodes: () => mockedTalentNodes,
      };
    });

    try {
      vi.resetModules();
      const { getTemplatePickerSections: getTemplatePickerSectionsWithMockedTalents } = await import('./templatePickerActions');
      const sections = getTemplatePickerSectionsWithMockedTalents(['power_strike', 'minor_heal']);
      const combatCore = sections.find((section) => section.key === 'combat-core');
      const utility = sections.find((section) => section.key === 'utility');

      expect(combatCore?.actions.map((action) => action.id)).toEqual([
        'light_attack',
        'normal_attack',
        'heavy_attack',
        'use_hp_potion',
        'power_strike',
      ]);
      expect(utility?.actions.map((action) => action.id)).toContain('minor_heal');
    } finally {
      vi.doUnmock('@pocketrealm/shared');
      vi.resetModules();
    }
  });

  it('places future always-available actions by shared metadata when they are not explicitly ordered', async () => {
    vi.doMock('@pocketrealm/shared', async () => {
      const actual = await vi.importActual<typeof import('@pocketrealm/shared')>('@pocketrealm/shared');
      return {
        ...actual,
        ALWAYS_AVAILABLE_ACTION_IDS: new Set([...actual.ALWAYS_AVAILABLE_ACTION_IDS, 'battle_cry']),
      };
    });

    try {
      vi.resetModules();
      const { getTemplatePickerSections: getTemplatePickerSectionsWithMockedActions } = await import('./templatePickerActions');
      const sections = getTemplatePickerSectionsWithMockedActions([]);
      const combatCore = sections.find((section) => section.key === 'combat-core');
      const utility = sections.find((section) => section.key === 'utility');

      expect(combatCore?.actions.map((action) => action.id)).not.toContain('battle_cry');
      expect(utility?.actions.map((action) => action.id)).toContain('battle_cry');
    } finally {
      vi.doUnmock('@pocketrealm/shared');
      vi.resetModules();
    }
  });
});
