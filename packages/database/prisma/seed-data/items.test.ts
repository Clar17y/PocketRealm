import { describe, expect, it } from 'vitest';

import { getAllItemTemplates } from './items';
import { validateItemTemplates } from './validation';

describe('item seed combat data', () => {
  it('item templates only use supported combat stat keys', () => {
    const invalidItems = validateItemTemplates(getAllItemTemplates())
      .filter((item) => item.errors.some((error) => error.startsWith('unsupported stat keys:')));

    expect(invalidItems).toEqual([]);
  });

  it('ranged weapon templates must provide rangedPower', () => {
    const invalidRangedWeapons = validateItemTemplates(getAllItemTemplates())
      .filter((item) => item.errors.includes('ranged weapon missing rangedPower'));

    expect(invalidRangedWeapons).toEqual([]);
  });
});
