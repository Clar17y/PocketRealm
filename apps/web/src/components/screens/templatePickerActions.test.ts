import { describe, expect, it, vi } from 'vitest';
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

    expect(combatCore?.title).toBe('Combat Core');
    expect(combatCore?.actions.map((action) => action.id)).toContain('power_strike');
    expect(combatCore?.actions.map((action) => action.id)).toContain('minor_heal');
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

  it('keeps unlocked talent ordering stable when object key order changes', async () => {
    const actualKeys = Object.keys;
    const keysSpy = vi.spyOn(Object, 'keys').mockImplementation((value) => {
      if (
        value &&
        typeof value === 'object' &&
        'power_strike' in value &&
        'minor_heal' in value
      ) {
        return actualKeys(value).reverse();
      }

      return actualKeys(value);
    });

    try {
      vi.resetModules();
      const { getTemplatePickerSections: getTemplatePickerSectionsWithMockedKeys } = await import('./templatePickerActions');
      const sections = getTemplatePickerSectionsWithMockedKeys(['power_strike', 'minor_heal']);
      const combatCore = sections.find((section) => section.key === 'combat-core');

      expect(combatCore?.actions.map((action) => action.id)).toEqual([
        'light_attack',
        'normal_attack',
        'heavy_attack',
        'use_hp_potion',
        'power_strike',
        'minor_heal',
      ]);
    } finally {
      keysSpy.mockRestore();
    }
  });
});
