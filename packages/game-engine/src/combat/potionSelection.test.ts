import { describe, expect, it } from 'vitest';
import type { CombatPotion } from '@pocketrealm/shared';
import { findStrongestResourcePotionIndex, isResourcePotionType, type ResourcePotionType } from './potionSelection';

function potion(
  potionType: CombatPotion['potionType'],
  healAmount: number,
  templateId: string,
): CombatPotion {
  return {
    name: templateId,
    healAmount,
    templateId,
    potionType,
  };
}

describe('findStrongestResourcePotionIndex', () => {
  it('identifies resource potion types', () => {
    expect(isResourcePotionType('hp')).toBe(true);
    expect(isResourcePotionType('stamina')).toBe(true);
    expect(isResourcePotionType('mana')).toBe(true);
    expect(isResourcePotionType('cleanse')).toBe(false);
    expect(isResourcePotionType('buff_attack')).toBe(false);
    expect(isResourcePotionType('buff_defence')).toBe(false);
  });

  it.each([
    ['hp', 'greater-hp'],
    ['stamina', 'greater-stamina'],
    ['mana', 'greater-mana'],
  ] as const)('selects the strongest %s potion', (potionType: ResourcePotionType, expectedTemplateId) => {
    const potions = [
      potion(potionType, 50, `minor-${potionType}`),
      potion('cleanse', 0, 'cleanse'),
      potion(potionType, 200, expectedTemplateId),
      potion(potionType, 100, `regular-${potionType}`),
    ];

    const index = findStrongestResourcePotionIndex(potions, potionType);

    expect(potions[index].templateId).toBe(expectedTemplateId);
  });

  it('ignores already-used potion indices', () => {
    const potions = [
      potion('hp', 50, 'minor-hp'),
      potion('hp', 200, 'greater-hp'),
      potion('hp', 100, 'regular-hp'),
    ];

    const index = findStrongestResourcePotionIndex(potions, 'hp', new Set([1]));

    expect(potions[index].templateId).toBe('regular-hp');
  });

  it('keeps first matching potion when heal amounts tie', () => {
    const potions = [
      potion('hp', 100, 'first-hp'),
      potion('hp', 100, 'second-hp'),
    ];

    const index = findStrongestResourcePotionIndex(potions, 'hp');

    expect(potions[index].templateId).toBe('first-hp');
  });

  it('returns -1 when no matching potion is available', () => {
    const potions = [
      potion('stamina', 100, 'stamina'),
      potion('mana', 100, 'mana'),
    ];

    expect(findStrongestResourcePotionIndex(potions, 'hp')).toBe(-1);
  });
});
