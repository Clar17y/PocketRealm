import { describe, expect, it } from 'vitest';

import {
  getRankCategoryAutocompleteChoices,
  RANK_CATEGORY_OPTIONS,
  resolveRankCategory,
} from './rankCategories.js';

describe('rankCategories', () => {
  it('resolves common player leaderboard aliases', () => {
    expect(resolveRankCategory('level')).toBe('character_level');
    expect(resolveRankCategory('pvp')).toBe('pvp_rating');
    expect(resolveRankCategory('weapon smithing')).toBe('skill_weaponsmithing');
  });

  it('does not expose guild categories through player rank commands', () => {
    const values = RANK_CATEGORY_OPTIONS.map((option) => option.value);

    expect(values).not.toContain('guild_level');
    expect(values).not.toContain('guild_renown');
    expect(values).not.toContain('guild_members');
    expect(resolveRankCategory('guild_level')).toBeNull();
    expect(getRankCategoryAutocompleteChoices('guild')).toEqual([]);
  });
});
