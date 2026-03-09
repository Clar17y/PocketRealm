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
  phaseTemplates?: { hpThreshold: number; template: BossTemplateAction[] }[];
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
  environmentalDotPercent?: number;
}

export interface RaidParticipant {
  playerId: string;
  username?: string;
  targetMobId?: string | null;
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
  roundLog: ExpeditionRoundLog;
}

// --- Expedition Data (API responses) ---

export interface ExpeditionMobInfo {
  id: string;
  name: string;
  prefix: string | null;
  hp: number;
  maxHp: number;
}

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
  currentRoomMobs: ExpeditionMobInfo[];
  roundLogs: ExpeditionRoundLog[];
}

export interface ExpeditionMemberData {
  playerId: string;
  username?: string;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  maxHp: number;
  maxStamina: number;
  maxMana: number;
  isKnockedOut: boolean;
  totalDamage: number;
  totalHealing: number;
  roomDamage: number;
  roomHealing: number;
  targetMobId: string | null;
  tokensEarned: number;
  signedUpAt: string;
}

// --- Round Log (detailed action-level breakdown) ---

export interface PlayerAttackEntry {
  playerId: string;
  username: string;
  actionId: string;
  actionLabel: string;
  targetMobId: string | null;
  targetMobName: string | null;
  attackRoll: number;
  modifier: number;
  defenseTarget: number;
  hit: boolean;
  crit: boolean;
  damageRoll?: number;
  totalDamage?: number;
  staminaCost: number;
  manaCost: number;
}

export interface MobActionLogEntry {
  mobId: string;
  mobName: string;
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  wasTelegraphed: boolean;
  targets: {
    playerId: string;
    username: string;
    damageTaken: number;
    blocked: boolean;
    knockedOut: boolean;
  }[];
}

export interface HealingEntry {
  playerId: string;
  username: string;
  actionLabel: string;
  amountHealed: number;
  targetPlayerId: string;
  targetUsername: string;
}

export interface RoundOutcomeEntry {
  mobsAlive: number;
  mobsKilled: number;
  playersAlive: number;
  playersKnockedOut: number;
  roomCleared: boolean;
  wipe: boolean;
}

export interface MobTelegraphEntry {
  mobId: string;
  mobName: string;
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  warningText: string;
}

export interface ExpeditionRoundLog {
  round: number;
  roomIndex: number;
  phases: {
    playerAttacks: PlayerAttackEntry[];
    mobActions: MobActionLogEntry[];
    healing: HealingEntry[];
    outcome: RoundOutcomeEntry;
  };
  telegraphs: MobTelegraphEntry[];
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
