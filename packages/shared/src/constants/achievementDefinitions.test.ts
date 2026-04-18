import { describe, expect, it } from 'vitest';
import {
  ALL_ACHIEVEMENTS,
  ACHIEVEMENTS_BY_ID,
  ACHIEVEMENTS_BY_STAT_KEY,
  ACHIEVEMENTS_BY_FAMILY_KEY,
  FAMILY_REWARD_ITEMS,
} from './achievementDefinitions';
import { PREMIUM_CONSTANTS } from './gameConstants';

describe('achievementDefinitions', () => {
  describe('ALL_ACHIEVEMENTS structural integrity', () => {
    it('is a non-empty array', () => {
      expect(ALL_ACHIEVEMENTS.length).toBeGreaterThan(0);
    });

    it('every achievement has required fields', () => {
      for (const a of ALL_ACHIEVEMENTS) {
        expect(a.id).toBeTruthy();
        expect(a.category).toBeTruthy();
        expect(a.title).toBeTruthy();
        expect(a.description).toBeTruthy();
        expect(typeof a.threshold).toBe('number');
        expect(a.threshold).toBeGreaterThanOrEqual(0);
      }
    });

    it('all IDs are unique', () => {
      const ids = ALL_ACHIEVEMENTS.map((a) => a.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('every achievement has a valid category', () => {
      const validCategories = new Set([
        'combat', 'exploration', 'crafting', 'skills',
        'gathering', 'bestiary', 'general', 'family', 'guild', 'casino', 'shop',
      ]);
      for (const a of ALL_ACHIEVEMENTS) {
        expect(validCategories.has(a.category)).toBe(true);
      }
    });

    it('achievements with statKey are present in ACHIEVEMENTS_BY_STAT_KEY', () => {
      for (const a of ALL_ACHIEVEMENTS) {
        if (a.statKey) {
          const group = ACHIEVEMENTS_BY_STAT_KEY.get(a.statKey);
          expect(group).toBeDefined();
          expect(group!.some((g) => g.id === a.id)).toBe(true);
        }
      }
    });

    it('achievements with familyKey are present in ACHIEVEMENTS_BY_FAMILY_KEY', () => {
      for (const a of ALL_ACHIEVEMENTS) {
        if (a.familyKey) {
          const group = ACHIEVEMENTS_BY_FAMILY_KEY.get(a.familyKey);
          expect(group).toBeDefined();
          expect(group!.some((g) => g.id === a.id)).toBe(true);
        }
      }
    });

    it('tier values are in range 1-5 when present', () => {
      for (const a of ALL_ACHIEVEMENTS) {
        if (a.tier !== undefined) {
          expect(a.tier).toBeGreaterThanOrEqual(1);
          expect(a.tier).toBeLessThanOrEqual(5);
        }
      }
    });

    it('rewards have valid types when present', () => {
      const validTypes = new Set(['xp', 'turns', 'attribute_points', 'item']);
      for (const a of ALL_ACHIEVEMENTS) {
        if (a.rewards) {
          for (const r of a.rewards) {
            expect(validTypes.has(r.type)).toBe(true);
            expect(r.amount).toBeGreaterThan(0);
            if (r.type === 'item') {
              expect(r.itemTemplateId).toBeTruthy();
            }
          }
        }
      }
    });
  });

  describe('ACHIEVEMENTS_BY_ID lookup', () => {
    it('has the same size as ALL_ACHIEVEMENTS', () => {
      expect(ACHIEVEMENTS_BY_ID.size).toBe(ALL_ACHIEVEMENTS.length);
    });

    it('can look up any achievement by id', () => {
      for (const a of ALL_ACHIEVEMENTS) {
        expect(ACHIEVEMENTS_BY_ID.get(a.id)).toBe(a);
      }
    });

    it('includes the Support Pocketrealm Champion title achievement', () => {
      expect(ACHIEVEMENTS_BY_ID.get(PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID)).toMatchObject({
        id: PREMIUM_CONSTANTS.SUPPORT_TITLE_ACHIEVEMENT_ID,
        category: 'shop',
        titleReward: PREMIUM_CONSTANTS.SUPPORT_TITLE,
      });
    });
  });

  describe('ACHIEVEMENTS_BY_STAT_KEY', () => {
    it('groups are sorted by threshold within each statKey', () => {
      for (const [, group] of ACHIEVEMENTS_BY_STAT_KEY) {
        for (let i = 1; i < group.length; i++) {
          expect(group[i].threshold).toBeGreaterThanOrEqual(group[i - 1].threshold);
        }
      }
    });
  });

  describe('family achievements', () => {
    it('every family key in FAMILY_REWARD_ITEMS has achievements', () => {
      for (const key of Object.keys(FAMILY_REWARD_ITEMS)) {
        expect(ACHIEVEMENTS_BY_FAMILY_KEY.has(key)).toBe(true);
      }
    });

    it('family achievements have 3 tiers per family', () => {
      for (const [, group] of ACHIEVEMENTS_BY_FAMILY_KEY) {
        expect(group).toHaveLength(3);
        expect(group[0].threshold).toBe(500);
        expect(group[1].threshold).toBe(2500);
        expect(group[2].threshold).toBe(5000);
      }
    });

    it('tier 3 family achievements have item rewards', () => {
      for (const [, group] of ACHIEVEMENTS_BY_FAMILY_KEY) {
        const tier3 = group.find((a) => a.tier === 3);
        expect(tier3).toBeDefined();
        expect(tier3!.rewards).toBeDefined();
        expect(tier3!.rewards![0].type).toBe('item');
      }
    });
  });
});
