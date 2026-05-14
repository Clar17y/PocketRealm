import { EXPEDITION_THEMES_BY_ID } from '@pocketrealm/shared/constants/expeditionDefinitions';
import { prisma } from '@pocketrealm/database';
import {
  EXPEDITION_CONSTANTS, type ExpeditionAttemptLog, type ExpeditionData, type ExpeditionMemberData, type ExpeditionStatus, type ExpeditionRoomDefinition, type ExpeditionRoundLog } from '@pocketrealm/shared';
import { parseJsonArray } from '../utils/jsonColumnSchemas';
import { validateEnum } from '../utils/validateEnum';
import { getCachedExpeditionMobTemplates } from './staticDataCacheService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VALID_EXPEDITION_STATUSES = new Set<ExpeditionStatus>(['recruiting', 'in_progress', 'completed', 'failed']);

// ---------------------------------------------------------------------------
// Data Transformation Types
// ---------------------------------------------------------------------------

export interface GuildExpeditionRow {
  id: string;
  guildId: string;
  tier: number;
  status: string;
  currentRoom: number;
  totalRooms: number;
  roomDefinitions: unknown;
  roundNumber: number;
  roundSummaries?: unknown;
  nextRoundAt: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  launchedBy: string;
  wipeCount?: number;
  expeditionAttemptLogs?: unknown;
  themeId?: string | null;
  _count?: { members: number };
}

export interface GuildExpeditionMemberRow {
  playerId: string;
  currentHp: number;
  currentStamina: number;
  currentMana: number;
  maxHp: number;
  maxStamina: number;
  maxMana: number;
  isKnockedOut: boolean;
  totalDamage: bigint;
  totalHealing: bigint;
  roomDamage: bigint;
  roomHealing: bigint;
  targetMobId: string | null;
  healTargetPlayerId?: string | null;
  activeEffects?: unknown;
  threatValue: number;
  tokensEarned: number;
  signedUpAt: Date;
  player?: { username: string };
}

// ---------------------------------------------------------------------------
// Data Transformation Functions
// ---------------------------------------------------------------------------

export function toExpeditionData(exp: GuildExpeditionRow): ExpeditionData {
  const rooms = parseJsonArray<ExpeditionRoomDefinition>(exp.roomDefinitions, 'roomDefinitions');
  const currentRoomDef = rooms[exp.currentRoom];
  const aliveMobs = currentRoomDef
    ? currentRoomDef.mobs.filter((m) => m.hp > 0)
    : [];

  const roundLogs = parseJsonArray<ExpeditionRoundLog>(exp.roundSummaries, 'roundSummaries');

  return {
    id: exp.id,
    guildId: exp.guildId,
    tier: exp.tier,
    status: validateEnum(exp.status, VALID_EXPEDITION_STATUSES, 'failed'),
    currentRoom: exp.currentRoom,
    totalRooms: exp.totalRooms,
    currentRoomType: currentRoomDef?.roomType ?? null,
    roundNumber: exp.roundNumber,
    nextRoundAt: exp.nextRoundAt?.toISOString() ?? null,
    startedAt: exp.startedAt.toISOString(),
    completedAt: exp.completedAt?.toISOString() ?? null,
    launchedBy: exp.launchedBy,
    wipeCount: exp.wipeCount ?? 0,
    attemptNumber: (exp.wipeCount ?? 0) + 1,
    participantCount: exp._count?.members ?? 0,
    mobsRemaining: aliveMobs.length,
    currentRoomMobs: aliveMobs.map(m => ({
      id: m.id,
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      activeEffects: m.activeEffects ?? [],
    })),
    roundLogs,
    attemptLogs: parseJsonArray<ExpeditionAttemptLog>(exp.expeditionAttemptLogs, 'expeditionAttemptLogs'),
    themeId: exp.themeId ?? null,
    themeName: EXPEDITION_THEMES_BY_ID.get(exp.themeId ?? '')?.name ?? null,
  };
}

export function toExpeditionMemberData(m: GuildExpeditionMemberRow): ExpeditionMemberData {
  return {
    playerId: m.playerId,
    username: m.player?.username,
    currentHp: m.currentHp,
    currentStamina: m.currentStamina,
    currentMana: m.currentMana,
    maxHp: m.maxHp,
    maxStamina: m.maxStamina,
    maxMana: m.maxMana,
    isKnockedOut: m.isKnockedOut,
    totalDamage: Number(m.totalDamage),
    totalHealing: Number(m.totalHealing),
    roomDamage: Number(m.roomDamage),
    roomHealing: Number(m.roomHealing),
    targetMobId: m.targetMobId,
    activeEffects: parseJsonArray<ExpeditionMemberData['activeEffects'][number]>(m.activeEffects, 'member.activeEffects'),
    healTargetPlayerId: m.healTargetPlayerId ?? null,
    threatValue: m.threatValue,
    tokensEarned: m.tokensEarned,
    signedUpAt: m.signedUpAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

export function getRoundInterval(rooms: ExpeditionRoomDefinition[], currentRoom: number): number {
  const roomType = rooms[currentRoom]?.roomType ?? 'trash';
  return EXPEDITION_CONSTANTS.ROUND_INTERVAL_BY_ROOM_TYPE[roomType]
    ?? EXPEDITION_CONSTANTS.ROUND_INTERVAL_BY_ROOM_TYPE.trash;
}

export async function getMembers(expeditionId: string) {
  const members = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
  });
  return members.map(m => ({
    playerId: m.playerId,
    currentHp: m.currentHp,
    currentStamina: m.currentStamina,
    currentMana: m.currentMana,
  }));
}

export async function cleanupExpeditionBots(expeditionId: string): Promise<void> {
  const botMembers = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId, player: { isBot: true } },
    select: { playerId: true },
  });
  if (botMembers.length === 0) return;
  await prisma.player.deleteMany({
    where: { id: { in: botMembers.map((m) => m.playerId) } },
  });
}

export async function buildTemplateIdMap(theme: import('@pocketrealm/shared').ExpeditionTheme): Promise<Map<string, string>> {
  const expeditionMobTemplates = await getCachedExpeditionMobTemplates();
  const templateIdMap = new Map<string, string>();
  const allThemeMobs = [
    ...theme.trash, ...theme.elites, theme.miniBoss,
    ...theme.miniBossAdds, theme.casterAdd, theme.finalBoss.mob,
    theme.regularAdd,
  ];
  for (const themeMob of allThemeMobs) {
    const match = expeditionMobTemplates.find(t => t.name === themeMob.name);
    if (match) templateIdMap.set(themeMob.key, match.id);
  }
  return templateIdMap;
}

export function buildUpdatedAttemptLogs(
  expedition: { roundSummaries: unknown; expeditionAttemptLogs: unknown; currentRoom: number; wipeCount: number; members?: Array<{ playerId: string; player?: { username: string }; totalDamage: bigint; totalHealing: bigint }> },
  extra?: Record<string, unknown>,
): unknown[] {
  const currentLogs = Array.isArray(expedition.roundSummaries) ? expedition.roundSummaries : [];
  const existing = Array.isArray(expedition.expeditionAttemptLogs) ? expedition.expeditionAttemptLogs : [];
  if (currentLogs.length === 0 && !extra) return existing as unknown[];

  const attemptLog: Record<string, unknown> = {
    attempt: (expedition.wipeCount ?? 0) + 1,
    roomReached: expedition.currentRoom,
    roundLogs: currentLogs,
    ...(expedition.members ? {
      participants: expedition.members.map(m => ({
        playerId: m.playerId,
        username: m.player?.username,
        totalDamage: Number(m.totalDamage),
        totalHealing: Number(m.totalHealing),
      })),
    } : {}),
    ...extra,
  };
  return [...(existing as unknown[]), attemptLog];
}

// ---------------------------------------------------------------------------
// Expedition Cooldowns
// ---------------------------------------------------------------------------

export async function setExpeditionCooldowns(expeditionId: string, tier: number): Promise<void> {
  const participants = await prisma.guildExpeditionMember.findMany({
    where: { expeditionId },
    select: { playerId: true },
  });

  if (participants.length === 0) return;

  const expiresAt = new Date(Date.now() + EXPEDITION_CONSTANTS.WEEKLY_COOLDOWN_MS);
  const playerIds = participants.map((p) => p.playerId);

  // Batch: delete existing then create fresh — single transaction, 2 queries instead of N
  await prisma.$transaction([
    prisma.expeditionCooldown.deleteMany({
      where: { playerId: { in: playerIds }, tier },
    }),
    prisma.expeditionCooldown.createMany({
      data: playerIds.map((playerId) => ({ playerId, tier, expiresAt })),
    }),
  ]);
}
