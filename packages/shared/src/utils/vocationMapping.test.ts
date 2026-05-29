import { describe, expect, it } from 'vitest';
import { GATHERING_SKILLS, type SkillType } from '../types/player.types';
import { normalizeGatheringSkillType, resolveGatheringVocation, resolveRecipeVocation } from './vocationMapping';

describe('vocationMapping', () => {
  it('prefers valid explicit recipe vocation ids', () => {
    expect(resolveRecipeVocation({
      recipeVocationId: 'bowyer',
      recipeSkillType: 'alchemy',
      resultItemType: 'consumable',
    })).toBe('bowyer');
  });

  it('returns null for invalid explicit recipe vocation ids', () => {
    expect(resolveRecipeVocation({
      recipeVocationId: 'not_a_vocation',
      recipeSkillType: 'alchemy',
      resultItemType: 'consumable',
    })).toBeNull();
  });

  it('does not infer refining recipes without an explicit vocation id', () => {
    expect(resolveRecipeVocation({
      recipeSkillType: 'refining',
      resultItemType: 'resource',
    })).toBeNull();
  });

  it('falls back for unambiguous craft and processing skills', () => {
    expect(resolveRecipeVocation({ recipeSkillType: 'alchemy' })).toBe('alchemist');
    expect(resolveRecipeVocation({ recipeSkillType: 'jewelcrafting' })).toBe('jeweller');
    expect(resolveRecipeVocation({ recipeSkillType: 'armorsmithing' })).toBe('armorer');
    expect(resolveRecipeVocation({ recipeSkillType: 'leatherworking' })).toBe('leatherworker');
    expect(resolveRecipeVocation({ recipeSkillType: 'tailoring' })).toBe('tailor');
    expect(resolveRecipeVocation({ recipeSkillType: 'tanning' })).toBe('leatherworker');
    expect(resolveRecipeVocation({ recipeSkillType: 'weaving' })).toBe('tailor');
  });

  it('does not infer broad weaponsmithing recipes without explicit richer mapping', () => {
    expect(resolveRecipeVocation({
      recipeSkillType: 'weaponsmithing',
      resultItemType: 'weapon',
      resultSlot: 'main_hand',
    })).toBeNull();
  });

  it('maps gathering skills to their gathering vocations', () => {
    expect(resolveGatheringVocation('mining')).toBe('prospector');
    expect(resolveGatheringVocation('woodcutting')).toBe('forester');
    expect(resolveGatheringVocation('foraging')).toBe('herbalist');
    expect(resolveGatheringVocation('herbalism')).toBe('herbalist');
    expect(resolveGatheringVocation('Herbalism')).toBe('herbalist');
    expect(resolveGatheringVocation('alchemy')).toBeNull();
  });

  it('normalizes compatibility aliases to supported gathering skill types', () => {
    expect(normalizeGatheringSkillType('herbalism')).toBe('foraging');
    expect(normalizeGatheringSkillType('Herbalism')).toBe('foraging');
    expect(normalizeGatheringSkillType('foraging')).toBe('foraging');
    expect(normalizeGatheringSkillType('alchemy')).toBeNull();
    expect(GATHERING_SKILLS.includes('herbalism' as SkillType)).toBe(false);
  });
});
