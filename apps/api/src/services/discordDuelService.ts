import { Prisma, prisma } from '@pocketrealm/database';
import { runTemplateCombat } from '@pocketrealm/game-engine';
import { DISCORD_DUEL_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import { AppError } from '../middleware/errorHandler';
import { mapTemplateCombatLog } from './combatLogMapper';
import { requireLinkedDiscordPlayer } from './discordLinkedPlayer';
import { buildPvpCombatant } from './pvpCombatantBuilder';

const DISCORD_DUEL_RESOLVING_STATUS = 'resolving';

export interface CreateDiscordDuelInput {
  guildId: string;
  channelId: string;
  challengerDiscordUserId: string;
  targetDiscordUserId: string;
}

interface LinkedDiscordPlayer {
  id: string;
  username: string;
}

interface DiscordDuelPlayerSummary {
  username: string;
}

interface DiscordDuelRecord {
  id: string;
  status: string;
  challengerDiscordUserId: string;
  targetDiscordUserId: string;
  challengerPlayerId: string;
  targetPlayerId: string;
  winnerPlayerId: string | null;
  isDraw: boolean;
  combatLog: Prisma.JsonValue | null;
  summary: Prisma.JsonValue | null;
  expiresAt: Date;
  challenger: DiscordDuelPlayerSummary;
  target: DiscordDuelPlayerSummary;
}

export interface DiscordDuelDto {
  id: string;
  status: string;
  challengerUsername: string;
  targetUsername: string;
  winnerUsername: string | null;
  isDraw: boolean;
  expiresAt: Date;
  summary: Prisma.JsonValue | null;
  replay: DiscordDuelReplayDto;
}

export interface PendingDiscordDuelDto {
  id: string;
  status: string;
  challengerUsername: string;
  targetUsername: string;
  expiresAt: Date;
}

export interface DiscordDuelReplayDto {
  id: string;
  status: string;
  page: number;
  pageSize: number;
  hasMore: boolean;
  summary: Prisma.JsonValue | null;
  entries: unknown[];
}

function discordDuelInclude() {
  return {
    challenger: { select: { username: true } },
    target: { select: { username: true } },
  } as const;
}

function winnerUsernameFor(duel: DiscordDuelRecord): string | null {
  if (!duel.winnerPlayerId) return null;
  if (duel.winnerPlayerId === duel.challengerPlayerId) return duel.challenger.username;
  if (duel.winnerPlayerId === duel.targetPlayerId) return duel.target.username;
  return null;
}

type JsonObject = Record<string, Prisma.JsonValue>;

function isJsonObject(value: Prisma.JsonValue | null): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function replaySummaryFor(
  duel: Pick<DiscordDuelRecord, 'summary' | 'challenger' | 'target'>,
): Prisma.JsonValue {
  return {
    ...(isJsonObject(duel.summary) ? duel.summary : {}),
    challengerUsername: duel.challenger.username,
    targetUsername: duel.target.username,
  };
}

function safeReplayPage(
  duel: Pick<DiscordDuelRecord, 'id' | 'status' | 'combatLog' | 'summary' | 'challenger' | 'target'>,
  page: number,
): DiscordDuelReplayDto {
  const entries = Array.isArray(duel.combatLog) ? duel.combatLog : [];
  const start = (page - 1) * DISCORD_DUEL_CONSTANTS.REPLAY_PAGE_SIZE;
  const pageEntries = entries.slice(start, start + DISCORD_DUEL_CONSTANTS.REPLAY_PAGE_SIZE);

  return {
    id: duel.id,
    status: duel.status,
    page,
    pageSize: DISCORD_DUEL_CONSTANTS.REPLAY_PAGE_SIZE,
    hasMore: start + DISCORD_DUEL_CONSTANTS.REPLAY_PAGE_SIZE < entries.length,
    summary: replaySummaryFor(duel),
    entries: pageEntries,
  };
}

function pendingDto(duel: DiscordDuelRecord): PendingDiscordDuelDto {
  return {
    id: duel.id,
    status: duel.status,
    challengerUsername: duel.challenger.username,
    targetUsername: duel.target.username,
    expiresAt: duel.expiresAt,
  };
}

function completedDto(duel: DiscordDuelRecord): DiscordDuelDto {
  return {
    id: duel.id,
    status: duel.status,
    challengerUsername: duel.challenger.username,
    targetUsername: duel.target.username,
    winnerUsername: winnerUsernameFor(duel),
    isDraw: duel.isDraw,
    expiresAt: duel.expiresAt,
    summary: duel.summary,
    replay: safeReplayPage(duel, 1),
  };
}

async function getLinkedActivePlayer(
  guildId: string,
  discordUserId: string,
  participant: 'challenger' | 'target',
): Promise<LinkedDiscordPlayer> {
  const label = participant === 'challenger' ? 'Challenger' : 'Target';
  const codePrefix = participant === 'challenger' ? 'DISCORD_DUEL_CHALLENGER' : 'DISCORD_DUEL_TARGET';

  const { player } = await requireLinkedDiscordPlayer(
    { guildId, discordUserId },
    {
      linkRequired: {
        message: `${label} Discord account is not linked`,
        code: `${codePrefix}_LINK_REQUIRED`,
      },
      playerRequired: {
        message: `${label} linked account has no active player`,
        code: `${codePrefix}_PLAYER_NOT_FOUND`,
      },
    },
  );

  return player;
}

async function buildDiscordDuelCombatant(playerId: string, username: string) {
  const combatant = await buildPvpCombatant(playerId, username, false, { readOnlySkillAllocation: true });

  return {
    ...combatant,
    stamina: combatant.maxStamina,
    mana: combatant.maxMana,
    stats: { ...combatant.stats, hp: combatant.stats.maxHp },
  };
}

async function getDuelOrThrow(duelId: string): Promise<DiscordDuelRecord> {
  const duel = await prisma.discordDuel.findUnique({
    where: { id: duelId },
    include: discordDuelInclude(),
  });

  if (!duel) {
    throw new AppError(404, 'Discord duel not found', 'DISCORD_DUEL_NOT_FOUND');
  }

  return duel;
}

async function throwDiscordDuelClaimError(
  duelId: string,
  acceptedByDiscordUserId: string,
  now: Date,
): Promise<never> {
  const duel = await prisma.discordDuel.findUnique({
    where: { id: duelId },
    select: {
      status: true,
      expiresAt: true,
      targetDiscordUserId: true,
    },
  });

  if (!duel) {
    throw new AppError(404, 'Discord duel not found', 'DISCORD_DUEL_NOT_FOUND');
  }
  if (duel.status !== 'pending') {
    throw new AppError(409, 'Discord duel is no longer pending', 'DISCORD_DUEL_NOT_PENDING');
  }
  if (duel.expiresAt <= now) {
    throw new AppError(410, 'Discord duel challenge has expired', 'DISCORD_DUEL_EXPIRED');
  }
  if (acceptedByDiscordUserId !== duel.targetDiscordUserId) {
    throw new AppError(403, 'Only the challenged Discord user can accept this duel', 'DISCORD_DUEL_NOT_TARGET');
  }

  throw new AppError(409, 'Discord duel could not be claimed', 'DISCORD_DUEL_CLAIM_CONFLICT');
}

async function restorePendingDiscordDuelClaim(
  duelId: string,
  acceptedByDiscordUserId: string,
  acceptedAt: Date,
): Promise<void> {
  try {
    await prisma.discordDuel.updateMany({
      where: {
        id: duelId,
        status: DISCORD_DUEL_RESOLVING_STATUS,
        acceptedAt,
        targetDiscordUserId: acceptedByDiscordUserId,
      },
      data: {
        status: 'pending',
        acceptedAt: null,
      },
    });
  } catch {
    // Preserve the original simulation/write failure; a later accept will report the current duel state.
  }
}

export async function createPendingDiscordDuel(input: CreateDiscordDuelInput): Promise<PendingDiscordDuelDto> {
  if (input.challengerDiscordUserId === input.targetDiscordUserId) {
    throw new AppError(400, 'Cannot challenge yourself to a Discord duel', 'DISCORD_DUEL_SELF_CHALLENGE');
  }

  const [challenger, target] = await Promise.all([
    getLinkedActivePlayer(input.guildId, input.challengerDiscordUserId, 'challenger'),
    getLinkedActivePlayer(input.guildId, input.targetDiscordUserId, 'target'),
  ]);

  const duel = await prisma.discordDuel.create({
    data: {
      guildId: input.guildId,
      channelId: input.channelId,
      challengerDiscordUserId: input.challengerDiscordUserId,
      targetDiscordUserId: input.targetDiscordUserId,
      challengerPlayerId: challenger.id,
      targetPlayerId: target.id,
      status: 'pending',
      expiresAt: new Date(Date.now() + DISCORD_DUEL_CONSTANTS.TTL_MS),
    },
    include: discordDuelInclude(),
  });

  return pendingDto(duel);
}

export async function recordDiscordDuelMessage(
  duelId: string,
  messageId: string,
): Promise<{ id: string; messageId: string | null }> {
  await prisma.discordDuel.updateMany({
    where: {
      id: duelId,
      OR: [
        { messageId: null },
        { messageId },
      ],
    },
    data: { messageId },
  });

  const duel = await prisma.discordDuel.findUnique({
    where: { id: duelId },
    select: { id: true, messageId: true },
  });

  if (!duel) {
    throw new AppError(404, 'Discord duel not found', 'DISCORD_DUEL_NOT_FOUND');
  }
  if (duel.messageId !== messageId) {
    throw new AppError(409, 'Discord duel message id has already been recorded', 'DISCORD_DUEL_MESSAGE_CONFLICT');
  }

  return { id: duel.id, messageId: duel.messageId };
}

export async function resolveDiscordDuel(
  duelId: string,
  acceptedByDiscordUserId: string,
): Promise<DiscordDuelDto> {
  const duel = await getDuelOrThrow(duelId);
  const now = new Date();

  if (duel.status !== 'pending') {
    throw new AppError(409, 'Discord duel is no longer pending', 'DISCORD_DUEL_NOT_PENDING');
  }
  if (duel.expiresAt <= now) {
    throw new AppError(410, 'Discord duel challenge has expired', 'DISCORD_DUEL_EXPIRED');
  }
  if (acceptedByDiscordUserId !== duel.targetDiscordUserId) {
    throw new AppError(403, 'Only the challenged Discord user can accept this duel', 'DISCORD_DUEL_NOT_TARGET');
  }

  const claim = await prisma.discordDuel.updateMany({
    where: {
      id: duelId,
      status: 'pending',
      expiresAt: { gt: now },
      targetDiscordUserId: acceptedByDiscordUserId,
    },
    data: {
      status: DISCORD_DUEL_RESOLVING_STATUS,
      acceptedAt: now,
    },
  });

  if (claim.count !== 1) {
    await throwDiscordDuelClaimError(duelId, acceptedByDiscordUserId, now);
  }

  // Guarded region: only the combat simulation + completion write may restore
  // the pending claim on failure. The post-completion re-read happens after,
  // so a transient read failure cannot revert an already-completed duel.
  try {
    const [challengerCombatant, targetCombatant] = await Promise.all([
      buildDiscordDuelCombatant(duel.challengerPlayerId, duel.challenger.username),
      buildDiscordDuelCombatant(duel.targetPlayerId, duel.target.username),
    ]);

    const combatResult = runTemplateCombat(challengerCombatant, targetCombatant, { combatMode: 'pvp' });
    const combatLog = mapTemplateCombatLog(combatResult.log);
    const isDraw = combatResult.outcome === 'draw';
    const challengerWon = combatResult.outcome === 'victory';
    const winnerPlayerId = isDraw ? null : challengerWon ? duel.challengerPlayerId : duel.targetPlayerId;
    const winnerUsername = isDraw ? null : challengerWon ? duel.challenger.username : duel.target.username;
    const summary = {
      outcome: combatResult.outcome,
      totalRounds: combatResult.totalRounds,
      challengerUsername: duel.challenger.username,
      targetUsername: duel.target.username,
      winnerUsername,
      isDraw,
      challengerHpRemaining: combatResult.combatantAHpRemaining,
      targetHpRemaining: combatResult.combatantBHpRemaining,
      challengerMaxHp: combatResult.combatantAMaxHp,
      targetMaxHp: combatResult.combatantBMaxHp,
      challengerMaxStamina: combatResult.combatantAMaxStamina,
      targetMaxStamina: combatResult.combatantBMaxStamina,
      challengerStaminaRemaining: combatResult.combatantAStaminaRemaining,
      targetStaminaRemaining: combatResult.combatantBStaminaRemaining,
      challengerMaxMana: combatResult.combatantAMaxMana,
      targetMaxMana: combatResult.combatantBMaxMana,
      challengerManaRemaining: combatResult.combatantAManaRemaining,
      targetManaRemaining: combatResult.combatantBManaRemaining,
    };

    const completion = await prisma.discordDuel.updateMany({
      where: {
        id: duelId,
        status: DISCORD_DUEL_RESOLVING_STATUS,
        acceptedAt: now,
        targetDiscordUserId: acceptedByDiscordUserId,
      },
      data: {
        status: 'completed',
        completedAt: now,
        winnerPlayerId,
        isDraw,
        combatLog: combatLog as unknown as Prisma.InputJsonValue,
        summary: summary as unknown as Prisma.InputJsonValue,
      },
    });

    if (completion.count !== 1) {
      throw new AppError(409, 'Discord duel completion could not be applied', 'DISCORD_DUEL_COMPLETION_CONFLICT');
    }
  } catch (error) {
    await restorePendingDiscordDuelClaim(duelId, acceptedByDiscordUserId, now);
    throw error;
  }

  const updated = await getDuelOrThrow(duelId);

  return completedDto(updated);
}

export async function getDiscordDuelReplay(duelId: string, page: number): Promise<DiscordDuelReplayDto> {
  const duel = await getDuelOrThrow(duelId);

  return safeReplayPage(duel, page);
}
