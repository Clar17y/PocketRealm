import { describe, expect, it } from 'vitest';
import { matchLookupName, normalizeLookupName } from './discordLookupMatch';

describe('normalizeLookupName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeLookupName('  Spider   Silk  ')).toBe('spider silk');
  });
});

describe('matchLookupName', () => {
  const names = ['Spider Silk', 'Spider Fang', 'Warg Pelt', 'Iron Ingot', 'Copper Ore'];

  it('returns an exact match (case-insensitive) and no suggestions', () => {
    expect(matchLookupName('spider silk', names)).toEqual({
      matchedName: 'Spider Silk',
      suggestions: [],
    });
  });

  it('suggests prefix and contains matches when there is no exact match', () => {
    const result = matchLookupName('spider', names);
    expect(result.matchedName).toBeNull();
    expect(result.suggestions).toContain('Spider Silk');
    expect(result.suggestions).toContain('Spider Fang');
  });

  it('suggests close edit-distance matches for typos', () => {
    const result = matchLookupName('iron ingto', names);
    expect(result.matchedName).toBeNull();
    expect(result.suggestions).toContain('Iron Ingot');
  });

  it('caps suggestions at 5 and de-duplicates names', () => {
    const many = ['Slime A', 'Slime B', 'Slime C', 'Slime D', 'Slime E', 'Slime F', 'Slime A'];
    const result = matchLookupName('slime', many);
    expect(result.suggestions).toHaveLength(5);
    expect(new Set(result.suggestions).size).toBe(5);
  });

  it('returns no suggestions when nothing is close', () => {
    expect(matchLookupName('zzzzzz', names)).toEqual({ matchedName: null, suggestions: [] });
  });
});
