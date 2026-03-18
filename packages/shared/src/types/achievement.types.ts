export type AchievementCategory =
  | 'combat'
  | 'exploration'
  | 'crafting'
  | 'skills'
  | 'gathering'
  | 'bestiary'
  | 'general'
  | 'family'
  | 'guild'
  | 'casino'
  | 'shop';

export interface AchievementReward {
  type: 'xp' | 'turns' | 'attribute_points' | 'item';
  amount: number;
  itemTemplateId?: string;
}

export interface AchievementDef {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  flavorText?: string;
  titleReward?: string;
  rewards?: AchievementReward[];
  secret?: boolean;
  tier?: number;
  statKey?: string;
  familyKey?: string;
  threshold: number;
}

export interface PlayerAchievementProgress {
  id: string;
  category: AchievementCategory;
  title: string;
  description: string;
  flavorText?: string;
  titleReward?: string;
  threshold: number;
  secret?: boolean;
  tier?: number;
  statKey?: string;
  familyKey?: string;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
  rewardClaimed?: boolean;
  rewards?: AchievementReward[];
}

export interface AchievementsResponse {
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
}

export interface ClaimRewardResponse {
  success: boolean;
  rewards: AchievementReward[];
}
