import { describe, expect, it } from 'vitest';

import { wikiNavigation } from './wikiNavigation';

describe('wikiNavigation', () => {
  it('links the vocation mastery guide from crafting', () => {
    const crafting = wikiNavigation.find((section) => section.slug === 'crafting');

    expect(crafting?.items).toEqual(expect.arrayContaining([
      { label: 'Vocation Mastery', href: '/wiki/crafting/vocations' },
    ]));
  });
});
