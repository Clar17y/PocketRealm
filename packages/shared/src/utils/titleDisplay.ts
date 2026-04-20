import { ACHIEVEMENTS_BY_ID } from '../constants/achievementDefinitions';
import type { TitleDisplay } from '../types/achievement.types';

export function resolveAchievementTitleDisplay(activeTitleId: string | null | undefined): TitleDisplay {
  if (!activeTitleId) {
    return {};
  }

  const definition = ACHIEVEMENTS_BY_ID.get(activeTitleId);
  if (!definition?.titleReward) {
    return {};
  }

  return {
    title: definition.titleReward,
    titleTier: definition.tier,
    titleStyle: definition.titleStyle,
  };
}
