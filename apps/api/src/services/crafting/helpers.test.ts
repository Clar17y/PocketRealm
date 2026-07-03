import { describe, expect, it } from 'vitest';
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

  it('rejects craft quantities above the 200 attempt budget cap', () => {
    expect(() =>
      craftSchema.parse({
        recipeId: '11111111-1111-4111-8111-111111111111',
        quantity: 201,
        destination: 'stash',
        autoForgeMinRarity: 'rare',
      }),
    ).toThrow();
  });
});
