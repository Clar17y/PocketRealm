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
    expect(results[0]?.href).toBe('/wiki/pvp/elo');
  });

  it('prioritizes exact high-value aliases over incidental matches', () => {
    expect(searchWiki('pvp')[0]?.href).toBe('/wiki/pvp/combat');
    expect(searchWiki('duel')[0]?.href).toBe('/wiki/pvp/combat');
    expect(searchWiki('ranked pvp')[0]?.href).toBe('/wiki/pvp/elo');
  });

  it('returns deterministic limited results', () => {
    expect(searchWiki('combat', { limit: 3 })).toHaveLength(3);
    expect(searchWiki('combat', { limit: 3 })).toEqual(searchWiki('combat', { limit: 3 }));
  });
});
