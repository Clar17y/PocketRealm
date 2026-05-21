import { describe, expect, it } from 'vitest';
import { resolveGatheringVocation, resolveRecipeVocation } from './vocationMapping';

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
    expect(resolveGatheringVocation('alchemy')).toBeNull();
  });
});
