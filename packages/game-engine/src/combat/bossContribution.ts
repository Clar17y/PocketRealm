import { BOSS_ENCOUNTER_CONSTANTS } from '@pocketrealm/shared';

export interface BossContributionInput {
  totalDamage: number;
  totalHealing: number;
  damageAbsorbed: number;
  roundsSurvived: number;
}

export function calculateContributionScore(input: BossContributionInput): number {
  return (
    input.totalDamage * BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_DAMAGE_WEIGHT +
    input.totalHealing * BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_HEALING_WEIGHT +
    input.damageAbsorbed * BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_ABSORB_WEIGHT +
    input.roundsSurvived * BOSS_ENCOUNTER_CONSTANTS.CONTRIBUTION_SURVIVAL_FLAT_BONUS
  );
}
