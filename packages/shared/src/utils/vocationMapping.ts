import { VOCATION_IDS } from '../constants/vocationDefinitions';
import type { VocationId } from '../types/vocation.types';

const RECIPE_SKILL_VOCATIONS: Readonly<Record<string, VocationId>> = {
  alchemy: 'alchemist',
  jewelcrafting: 'jeweller',
  armorsmithing: 'armorer',
  leatherworking: 'leatherworker',
  tailoring: 'tailor',
  tanning: 'leatherworker',
  weaving: 'tailor',
};

const GATHERING_SKILL_VOCATIONS: Readonly<Record<string, VocationId>> = {
  mining: 'prospector',
  woodcutting: 'forester',
  foraging: 'herbalist',
};

export function resolveRecipeVocation(input: {
  recipeVocationId?: string | null;
  resultSlot?: string | null;
  resultItemType?: string | null;
  recipeSkillType?: string | null;
}): VocationId | null {
  if (input.recipeVocationId !== undefined && input.recipeVocationId !== null) {
    return isVocationId(input.recipeVocationId) ? input.recipeVocationId : null;
  }

  const skillType = input.recipeSkillType;
  if (!skillType) {
    return null;
  }

  return RECIPE_SKILL_VOCATIONS[skillType] ?? null;
}

export function resolveGatheringVocation(skillType: string): VocationId | null {
  return GATHERING_SKILL_VOCATIONS[skillType] ?? null;
}

function isVocationId(value: string): value is VocationId {
  return (VOCATION_IDS as readonly string[]).includes(value);
}
