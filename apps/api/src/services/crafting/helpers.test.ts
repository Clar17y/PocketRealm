import { describe, expect, it } from 'vitest';
import { CRAFTING_CONSTANTS } from '@pocketrealm/shared';
import { craftSchema } from './helpers';

describe('craftSchema', () => {
  it('accepts craft quantities up to the 200 attempt budget cap', () => {
    const parsed = craftSchema.parse({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: 200,
      destination: 'stash',
      autoForgeMinRarity: 'rare',
    });

    expect(parsed.quantity).toBe(200);
  });

  it('accepts large stackable batch quantities up to the sanity cap', () => {
    const parsed = craftSchema.parse({
      recipeId: '11111111-1111-4111-8111-111111111111',
      quantity: CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY_SANITY,
    });

    expect(parsed.quantity).toBe(CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY_SANITY);
  });

  it('rejects craft quantities above the sanity cap', () => {
    expect(() =>
      craftSchema.parse({
        recipeId: '11111111-1111-4111-8111-111111111111',
        quantity: CRAFTING_CONSTANTS.MAX_CRAFT_QUANTITY_SANITY + 1,
      }),
    ).toThrow();
  });
});
