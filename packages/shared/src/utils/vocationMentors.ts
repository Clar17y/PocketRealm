import { VOCATION_MASTERY } from '../constants/gameConstants';
import type { VocationMentorTown, VocationTechniqueDefinition } from '../types/vocation.types';

export function isAdvancedVocationTechnique(technique: Pick<VocationTechniqueDefinition, 'requiredRank'>): boolean {
  return technique.requiredRank >= VOCATION_MASTERY.ADVANCED_MENTOR_RANK;
}

export function canLearnVocationTechniqueInTown(
  technique: Pick<VocationTechniqueDefinition, 'requiredRank'>,
  mentorTown: VocationMentorTown | null,
): boolean {
  if (!mentorTown) return false;
  if (!isAdvancedVocationTechnique(technique)) return true;

  return mentorTown === VOCATION_MASTERY.ADVANCED_MENTOR_TOWN;
}
