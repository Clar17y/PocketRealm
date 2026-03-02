export type GuildRole = 'leader' | 'officer' | 'member';
export type GuildRecruitmentMode = 'open' | 'request_to_join' | 'closed';
export type GuildSpecialization = 'warfare' | 'industry' | 'discovery';

export const GUILD_ROLES: GuildRole[] = ['leader', 'officer', 'member'];
export const GUILD_RECRUITMENT_MODES: GuildRecruitmentMode[] = ['open', 'request_to_join', 'closed'];

export interface GuildData {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leaderId: string;
  leaderUsername?: string;
  level: number;
  xp: string; // bigint as string
  memberCount: number;
  maxMembers: number;
  recruitmentMode: GuildRecruitmentMode;
  minLevelRequirement: number;
  taxRate: number;
  specialization: GuildSpecialization | null;
  renown: number;
  seasonalRenown: number;
  treasuryTurns: number;
  treasuryCap: number;
  createdAt: string;
}

export interface TaxInfo {
  rate: number;
  amount: number;
  guildId: string;
}

export interface GuildMemberData {
  playerId: string;
  username: string;
  characterLevel: number;
  role: GuildRole;
  joinedAt: string;
  totalTurnsContributed: number;
  weeklyTurnsContributed: number;
  lastActiveAt: string;
  isActive: boolean; // gained XP in last 48h
}

export interface GuildLogEntry {
  id: string;
  eventType: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface GuildSearchResult {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  level: number;
  memberCount: number;
  maxMembers: number;
  recruitmentMode: GuildRecruitmentMode;
  minLevelRequirement: number;
  taxRate: number;
  specialization: GuildSpecialization | null;
}

export interface GuildUpgradeData {
  id: string;
  upgradeKey: string;
  tier: number;
  effectType: string;
  effectValue: number;
  activatedAt: string;
  expiresAt: string;
  activatedBy: string;
}

export interface GuildContractData {
  id: string;
  contractKey: string;
  name: string;
  targetValue: number;
  currentValue: number;
  status: 'active' | 'completed' | 'expired';
  rewardGuildXp: number;
  rewardTreasuryTurns: number;
  weekStartedAt: string;
  expiresAt: string;
}

// --- Guild Projects ---

export type GuildProjectStatus = 'active' | 'completed';

export interface GuildProjectPerk {
  effectType: string;
  value: number;
}

export interface GuildProjectMaterialCost {
  category: string;
  quantity: number;
}

export interface GuildProjectDefinition {
  key: string;
  name: string;
  description: string;
  level: number;
  prerequisites: string[];
  treasuryCost: number;
  materialCosts: GuildProjectMaterialCost[];
  memberTurnGoal: number;
  perks: GuildProjectPerk[];
  guildXpReward: number;
}

export interface GuildProjectData {
  id: string;
  projectKey: string;
  name: string;
  description: string;
  level: number;
  status: GuildProjectStatus;
  treasuryCost: number;
  materialCosts: GuildProjectMaterialCost[];
  materialsProgress: Record<string, number>;
  memberTurnGoal: number;
  turnsContributed: number;
  perks: GuildProjectPerk[];
  startedAt: string;
  completedAt: string | null;
}

export interface GuildProjectContributionData {
  playerId: string;
  username: string;
  turnsContributed: number;
  materialsContributed: Record<string, number>;
}

// --- Guild Specialization ---

export interface SpecializationTierBonus {
  effectType: string;
  value: number;
}

export interface SpecializationTier {
  tier: number;
  guildLevelGate: number;
  bonuses: SpecializationTierBonus[];
}

export interface GuildSpecializationDefinition {
  path: GuildSpecialization;
  name: string;
  description: string;
  tiers: SpecializationTier[];
}
