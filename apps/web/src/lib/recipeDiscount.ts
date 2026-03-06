import { calculateCraftingTurnDiscount } from '@pocketrealm/game-engine';

interface RecipeInfo {
  skillType: string;
  requiredLevel: number;
}

interface SkillInfo {
  skillType: string;
  level: number;
}

interface CraftingRecipeEntry {
  isDiscovered: boolean;
  skillType: string;
  requiredLevel: number;
  resultTemplate: { id: string };
}

export interface RecipeDiscountLookup {
  recipeByTemplateId: Map<string, RecipeInfo>;
  skillByType: Map<string, number>;
}

export function buildRecipeDiscountLookup(
  craftingRecipes: CraftingRecipeEntry[],
  skills: SkillInfo[],
): RecipeDiscountLookup {
  const recipeByTemplateId = new Map(
    craftingRecipes
      .filter((r) => r.isDiscovered)
      .map((r) => [r.resultTemplate.id, { skillType: r.skillType, requiredLevel: r.requiredLevel }]),
  );
  const skillByType = new Map(skills.map((s) => [s.skillType, s.level]));
  return { recipeByTemplateId, skillByType };
}

export function getDiscountedCost(
  lookup: RecipeDiscountLookup,
  templateId: string,
  baseCost: number,
): number {
  const recipe = lookup.recipeByTemplateId.get(templateId);
  if (!recipe) return baseCost;
  const skillLevel = lookup.skillByType.get(recipe.skillType) ?? 1;
  return calculateCraftingTurnDiscount(baseCost, skillLevel, recipe.requiredLevel);
}

export function getRecipeSkillInfo(
  lookup: RecipeDiscountLookup,
  templateId: string,
): { recipeSkillLevel: number; recipeRequiredLevel: number } | null {
  const recipe = lookup.recipeByTemplateId.get(templateId);
  if (!recipe) return null;
  const skillLevel = lookup.skillByType.get(recipe.skillType) ?? 1;
  return { recipeSkillLevel: skillLevel, recipeRequiredLevel: recipe.requiredLevel };
}
