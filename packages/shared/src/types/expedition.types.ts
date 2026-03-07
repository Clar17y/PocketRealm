import type { BossActiveEffect } from './worldEvent.types';
import type { BossTargetMode, BossTemplateAction } from './bossTemplate.types';
import type { CombatantStats } from './combat.types';

// --- Expedition Status ---

export type ExpeditionStatus = 'recruiting' | 'in_progress' | 'completed' | 'failed';
export type ExpeditionRoomType = 'trash' | 'elite' | 'mini_boss' | 'event' | 'final_boss';

// --- Room & Mob Definitions ---

export interface ExpeditionMobState {
  id: string;
  mobTemplateId: string;
  name: string;
  prefix: string | null;
  hp: number;
  maxHp: number;
  stats: CombatantStats;
  actionTemplate: BossTemplateAction[];
  activeEffects: BossActiveEffect[];
}

export interface ExpeditionRoomDefinition {
  roomIndex: number;
  roomType: ExpeditionRoomType;
  mobs: ExpeditionMobState[];
  environmentalDotPercent?: number;
}

// --- Raid Round Engine Types ---

export interface RaidRoundInput {
  mobs: ExpeditionMobState[];
  participants: RaidParticipant[];
  threatTable: RaidThreatEntry[];
  roundNumber: number;
}

export interface RaidParticipant {
  playerId: string;
  stats: CombatantStats;
  template: { actionId: string; condition?: unknown; thenActionId?: string; sortOrder: number }[];
  actionDefinitions: Record<string, unknown>;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  staminaRegenPerRound: number;
  mana: number;
  maxMana: number;
  manaRegenPerRound: number;
  templateRound: number;
  activeEffects: BossActiveEffect[];
}

export interface RaidThreatEntry {
  playerId: string;
  threat: number;
  tauntRoundsRemaining: number;
}

export interface MobActionResult {
  mobId: string;
  actionId: string;
  targetMode: BossTargetMode;
  targetPlayerIds: string[];
  damageDealt: number;
  healingDone: number;
}

export interface RaidParticipantResult {
  playerId: string;
  actionId: string;
  targetMobId: string | null;
  wasExhausted: boolean;
  damageDealt: number;
  healingDone: number;
  damageTaken: number;
  hpAfter: number;
  staminaAfter: number;
  manaAfter: number;
  templateRoundAfter: number;
  isDead: boolean;
  hit: boolean;
  isCritical: boolean;
  activeEffectsAfter: BossActiveEffect[];
}

export interface RaidRoundResult {
  mobsAfter: ExpeditionMobState[];
  participantResults: RaidParticipantResult[];
  mobActionResults: MobActionResult[];
  threatTableAfter: RaidThreatEntry[];
  roomCleared: boolean;
  allPlayersDead: boolean;
}

// --- Expedition Data (API responses) ---

export interface ExpeditionData {
  id: string;
  guildId: string;
  tier: number;
  status: ExpeditionStatus;
  currentRoom: number;
  totalRooms: number;
  currentRoomType: ExpeditionRoomType | null;
  roundNumber: number;
  nextRoundAt: string | null;
  startedAt: string;
  completedAt: string | null;
  launchedBy: string;
  launchedByUsername?: string;
  participantCount: number;
  mobsRemaining: number;
}

export interface ExpeditionMemberData {
  playerId: string;
  username?: string;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  isKnockedOut: boolean;
  totalDamage: number;
  totalHealing: number;
  roomDamage: number;
  roomHealing: number;
  signedUpAt: string;
}

export interface ExpeditionRoundSummary {
  roundNumber: number;
  roomIndex: number;
  participantResults: RaidParticipantResult[];
  mobActionResults: MobActionResult[];
  roomCleared: boolean;
  allPlayersDead: boolean;
}

// --- Token Shop Types ---

export type ExpeditionSetId = 'vanguard' | 'sharpshooter' | 'arcanist';

export interface ExpeditionShopItem {
  id: string;
  setId: ExpeditionSetId;
  name: string;
  slot: string;
  tokenCost: number;
  stats: Partial<CombatantStats>;
  setBonus2pc: string;
  setBonus4pc: string;
}
