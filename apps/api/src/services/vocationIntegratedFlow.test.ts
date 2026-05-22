import { describe, expect, it } from 'vitest';
import { applyEquipmentActionModifiers } from '@pocketrealm/game-engine';
import {
  applyCraftTechniqueEffects,
  applyGatheringTechniqueEffects,
  getEligibleTechniquesForCraft,
  getEligibleTechniquesForGathering,
  getEquipmentActionModifiers,
  getTechniqueDefinition,
  parseCraftMarks,
  resolveGatheringVocation,
  resolveRecipeVocation,
  type CraftMarkDefinition,
} from '@pocketrealm/shared';
import { ACHIEVEMENTS_BY_STAT_KEY } from '@pocketrealm/shared/constants/achievementDefinitions';
import { BASE_ACTION_DEFINITIONS } from '@pocketrealm/shared/constants/combatActionDefinitions';

describe('vocation integrated flow contracts', () => {
  it('carries a learned Bowyer technique from craft selection to a marked bow combat action', () => {
    const vocationId = resolveRecipeVocation({
      recipeVocationId: 'bowyer',
      recipeSkillType: 'weaponsmithing',
      resultItemType: 'weapon',
      resultSlot: 'main_hand',
    });

    expect(vocationId).toBe('bowyer');

    const eligibleTechniques = getEligibleTechniquesForCraft({
      vocationId: 'bowyer',
      learnedTechniqueIds: ['bowyer_tight_string'],
      skillType: 'weaponsmithing',
      resultItemType: 'weapon',
      resultSlot: 'main_hand',
    });

    expect(eligibleTechniques.map((technique) => technique.id)).toEqual(['bowyer_tight_string']);

    const craftApplication = applyCraftTechniqueEffects(eligibleTechniques[0]);
    expect(craftApplication.craftMarks).toHaveLength(1);

    const persistedMark = persistCraftMark(craftApplication.craftMarks[0]!, 'bowyer_tight_string');
    const actionModifiers = getEquipmentActionModifiers({
      slot: 'main_hand',
      craftMarks: parseCraftMarks([persistedMark]),
    });

    expect(actionModifiers).toHaveLength(1);

    const normalAttack = BASE_ACTION_DEFINITIONS.normal_attack;
    const defend = BASE_ACTION_DEFINITIONS.defend;
    const modifiedAttack = applyEquipmentActionModifiers({
      action: normalAttack,
      modifiers: actionModifiers,
    });
    const unchangedDefend = applyEquipmentActionModifiers({
      action: defend,
      modifiers: actionModifiers,
    });

    expect(modifiedAttack.damageMultiplier ?? 1).toBeGreaterThan(normalAttack.damageMultiplier ?? 1);
    expect(modifiedAttack.durabilityWearMultiplier ?? 1).toBeGreaterThan(1);
    expect(unchangedDefend).toEqual(defend);
  });

  it('keeps Prospector gem techniques on the existing gem crit path and achievement stat keys', () => {
    const vocationId = resolveGatheringVocation('mining');
    expect(vocationId).toBe('prospector');

    const eligibleTechniques = getEligibleTechniquesForGathering({
      vocationId: 'prospector',
      learnedTechniqueIds: ['prospector_bright_inclusion'],
      skillType: 'mining',
      resourceCategory: 'gem',
    });

    expect(eligibleTechniques.map((technique) => technique.id)).toEqual(['prospector_bright_inclusion']);

    const application = applyGatheringTechniqueEffects(eligibleTechniques[0]);
    expect(application.critChanceDeltas).toEqual([
      expect.objectContaining({ critType: 'gem_crit' }),
    ]);
    expect(application).not.toHaveProperty('resourceGrade');

    expect(ACHIEVEMENTS_BY_STAT_KEY.get('totalVocationGatherCrits')?.map((achievement) => achievement.id))
      .toContain('vocation_gather_crits_25');
    expect((ACHIEVEMENTS_BY_STAT_KEY.get('totalVocationTechniqueUses') ?? []).map((achievement) => achievement.id))
      .toContain('vocation_technique_uses_50');
    expect(getTechniqueDefinition('prospector_bright_inclusion')?.name).toBe('Bright Inclusion');
  });
});

function persistCraftMark(mark: CraftMarkDefinition, sourceTechniqueId: string) {
  return {
    markId: mark.markId,
    name: mark.name,
    sourceTechniqueId,
    description: mark.description,
    itemStatBenefits: [...mark.itemStatBenefits],
    itemStatDrawbacks: [...mark.itemStatDrawbacks],
    actionModifiers: [...(mark.actionModifiers ?? [])],
  };
}
