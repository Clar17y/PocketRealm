import { describe, expect, it } from 'vitest';
import { searchWiki } from './wikiSearch';

describe('wikiSearch', () => {
  it('finds pages by title text', () => {
    const results = searchWiki('turn regen');
    expect(results[0]).toMatchObject({
      label: 'Turns & Regeneration',
      href: '/wiki/resources/turns',
    });
  });

  it('finds pages by alias keywords', () => {
    const results = searchWiki('elo rating');
    expect(results.some((result) => result.href === '/wiki/pvp/elo')).toBe(true);
  });

  it('returns deterministic limited results', () => {
    expect(searchWiki('combat', { limit: 3 })).toHaveLength(3);
    expect(searchWiki('combat', { limit: 3 })).toEqual(searchWiki('combat', { limit: 3 }));
  });
});
