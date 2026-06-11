import { CROWN_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import { describe, expect, it } from 'vitest';

import {
  getRankCategoryAutocompleteChoices,
  INVALID_RANK_CATEGORY_COPY,
  RANK_CATEGORY_OPTIONS,
  resolveRankCategory,
} from './rankCategories.js';

describe('rankCategories', () => {
  it('exposes every canonical player leaderboard category', () => {
    const slugs = Object.values(CROWN_CONSTANTS.CATEGORY_GROUPS).flat();
    const values = RANK_CATEGORY_OPTIONS.map((option) => option.value);

    expect(values).toEqual(slugs);
    for (const slug of slugs) {
      expect(resolveRankCategory(slug)).toBe(slug);
    }
  });

  it('stays within the Discord autocomplete choice limit', () => {
    expect(RANK_CATEGORY_OPTIONS.length).toBeLessThanOrEqual(25);
  });

  it('only suggests valid slugs in the invalid-category copy', () => {
    const values = RANK_CATEGORY_OPTIONS.map((option) => option.value);
    const mentioned = INVALID_RANK_CATEGORY_COPY.match(/[a-z]+(?:_[a-z]+)+/g) ?? [];

    expect(mentioned.length).toBeGreaterThan(0);
    for (const slug of mentioned) {
      expect(values).toContain(slug);
    }
  });

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
