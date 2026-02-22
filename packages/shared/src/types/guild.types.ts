export type GuildRole = 'leader' | 'officer' | 'member';
export type GuildRecruitmentMode = 'open' | 'invite_only' | 'closed';
export type GuildSpecialization = 'warfare' | 'industry' | 'discovery';

export const GUILD_ROLES: GuildRole[] = ['leader', 'officer', 'member'];
export const GUILD_RECRUITMENT_MODES: GuildRecruitmentMode[] = ['open', 'invite_only', 'closed'];

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
