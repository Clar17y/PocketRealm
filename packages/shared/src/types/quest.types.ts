export type ProgressType =
  | 'kill_count'
  | 'kill_family'
  | 'kill_prefix'
  | 'boss_rounds'
  | 'craft_items'
  | 'craft_rare'
  | 'gather_actions'
  | 'exploration_turns'
  | 'pvp_wins'
  | 'pvp_damage'
  | 'casino_wagers'
  | 'casino_bets'
  | 'zone_travel'
  | 'chest_open';

export type QuestCategory = 'combat' | 'exploration' | 'crafting' | 'gathering' | 'pvp' | 'casino';
export type QuestCadence = 'daily' | 'weekly';
export type QuestStatus = 'active' | 'completed' | 'claimed';

export interface QuestProgressUpdate {
  questId: string;
  questName: string;
  current: number;
  target: number;
  completed: boolean;
}

export interface QuestTemplateDefinition {
  key: string;
  name: string;
  description: string;
  category: QuestCategory;
  cadence: QuestCadence;
  progressType: ProgressType;
  targets: { low: number; mid: number; high: number };
  rewards: { low: [number, number]; mid: [number, number]; high: [number, number] };
  filter?: 'prefix' | 'rare_plus';
  unlockCondition?: 'pvp_unlocked' | 'casino_accessible' | 'multi_zone' | 'has_prefix_kills';
}

export interface PlayerQuestData {
  id: string;
  questKey: string;
  name: string;
  description: string;
  category: QuestCategory;
  cadence: QuestCadence;
  targetValue: number;
  currentValue: number;
  rewardAmount: number;
  status: QuestStatus;
  assignedAt: string;
  expiresAt: string;
  completedAt: string | null;
  claimedAt: string | null;
}

export interface PlayerQuestStateData {
  questTokens: number;
  dailyBonusClaimed: boolean;
  rerollsUsed: number;
  lastDailyReset: string;
  lastWeeklyReset: string;
}

export interface QuestShopItem {
  key: string;
  name: string;
  description: string;
  cost: number;
  category: 'consumable' | 'material' | 'recipe' | 'utility';
  permanent: boolean;
}
