import { describe, it, expect } from 'vitest';
import { getBestiaryFlavorText } from '../bestiaryService';

describe('getBestiaryFlavorText', () => {
  const mob = {
    flavorAppearance: 'A brown rat the size of a housecat.',
    flavorBehavior: 'Skittish but territorial.',
    flavorLore: 'Farmers consider them a seasonal nuisance.',
  };

  it('returns null for all fields when kills is 0', () => {
    expect(getBestiaryFlavorText(mob, 0)).toEqual({
      flavorAppearance: null,
      flavorBehavior: null,
      flavorLore: null,
    });
  });

  it('returns only appearance at 1 kill', () => {
    expect(getBestiaryFlavorText(mob, 1)).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: null,
      flavorLore: null,
    });
  });

  it('returns appearance only at 9 kills', () => {
    expect(getBestiaryFlavorText(mob, 9)).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: null,
      flavorLore: null,
    });
  });

  it('returns appearance + behavior at 10 kills', () => {
    expect(getBestiaryFlavorText(mob, 10)).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: null,
    });
  });

  it('returns appearance + behavior at 24 kills', () => {
    expect(getBestiaryFlavorText(mob, 24)).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: null,
    });
  });

  it('returns all at 25 kills', () => {
    expect(getBestiaryFlavorText(mob, 25)).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: 'Farmers consider them a seasonal nuisance.',
    });
  });

  it('returns all at 100 kills', () => {
    expect(getBestiaryFlavorText(mob, 100)).toEqual({
      flavorAppearance: 'A brown rat the size of a housecat.',
      flavorBehavior: 'Skittish but territorial.',
      flavorLore: 'Farmers consider them a seasonal nuisance.',
    });
  });

  it('handles mob with no flavour text', () => {
    const emptyMob = {
      flavorAppearance: null,
      flavorBehavior: null,
      flavorLore: null,
    };
    expect(getBestiaryFlavorText(emptyMob, 100)).toEqual({
      flavorAppearance: null,
      flavorBehavior: null,
      flavorLore: null,
    });
  });
});
