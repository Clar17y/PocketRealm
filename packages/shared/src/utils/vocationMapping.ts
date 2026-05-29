import { VOCATION_IDS } from '../constants/vocationDefinitions';
import { GATHERING_SKILLS, type SkillType } from '../types/player.types';
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

const GATHERING_SKILL_ALIASES: Readonly<Record<string, SkillType>> = {
  herbalism: 'foraging',
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
  const normalizedSkillType = normalizeGatheringSkillType(skillType);
  return normalizedSkillType ? GATHERING_SKILL_VOCATIONS[normalizedSkillType] ?? null : null;
}

export function normalizeGatheringSkillType(skillType: string): SkillType | null {
  const normalized = skillType.trim().toLowerCase();
  const aliased = GATHERING_SKILL_ALIASES[normalized];
  if (aliased) return aliased;
  const supportedSkillType = normalized as SkillType;
  return GATHERING_SKILLS.includes(supportedSkillType) ? supportedSkillType : null;
}

function isVocationId(value: string): value is VocationId {
  return (VOCATION_IDS as readonly string[]).includes(value);
}
