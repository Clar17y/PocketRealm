import {
  getMasteryPointsForRank,
  getPartialRespecRefund,
  getTechniqueDefinition,
  getVocationDefinition,
  getVocationRankForXp,
  getVocationXpForRank,
  VOCATION_IDS,
  VOCATION_MASTERY,
  type TaxInfo,
  type VocationDailyCapDto,
  type VocationId,
  type VocationMentorTown,
  type VocationSnapshotResponse,
  type VocationStateDto,
} from '@pocketrealm/shared';
import { Prisma, prisma, type PlayerVocation, type PlayerVocationDailyCap } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';
import { getDayStart } from '../utils/dateHelpers';
import { spendWithTaxTx, taxInfoFromResult, type TaxResult } from './guildTaxService';
import type { SpendTurnsResult } from './turnBankService';

export type { VocationDailyCapDto, VocationSnapshotResponse, VocationStateDto };

export interface VocationActionResult {
  snapshot: VocationSnapshotResponse;
  vocation: VocationStateDto;
  turnSpend?: SpendTurnsResult;
  taxInfo?: TaxInfo | null;
  taxResult?: TaxResult;
}

type PassiveVocationSource = 'craft' | 'gather';

const VOCATION_ID_SET = new Set<string>(VOCATION_IDS);

export async function getVocationSnapshot(playerId: string, now: Date = new Date()): Promise<VocationSnapshotResponse> {
  return buildSnapshotTx(prisma, playerId, now);
}

export async function honeVocation(input: {
  playerId: string;
  vocationId: VocationId;
  turns: number;
  now?: Date;
}): Promise<VocationActionResult> {
  const now = input.now ?? new Date();
  const vocation = requireVocation(input.vocationId);
  validateTurns(input.turns);

  return prisma.$transaction(async (tx) => {
    await enforceMentorTownTx(tx, input.playerId, vocation.mentorTown);

    const dayStart = getDayStart(now);
    const dailyCap = await loadLockedDailyCapTx(tx, input.playerId, dayStart);
    const currentTurnsSpent = getCurrentDailyTurnsSpent(dailyCap, dayStart);
    const updatedTurnsSpent = currentTurnsSpent + input.turns;

    if (updatedTurnsSpent > VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT) {
      throw new AppError(400, 'Daily vocation honing turn limit exceeded', 'VOCATION_DAILY_CAP_EXCEEDED');
    }

    const current = await loadLockedVocationTx(tx, input.playerId, input.vocationId);
    const updated = toProgressUpdate(current.xp + input.turns * VOCATION_MASTERY.ACTIVE_XP_PER_TURN);

    const spend = await spendWithTaxTx(tx, input.playerId, input.turns);
    const updatedVocation = await tx.playerVocation.upsert({
      where: { playerId_vocationId: { playerId: input.playerId, vocationId: input.vocationId } },
      create: {
        playerId: input.playerId,
        vocationId: input.vocationId,
        xp: updated.xp,
        rank: updated.rank,
        masteryPoints: updated.masteryPoints,
        spentPoints: current.spentPoints,
      },
      update: {
        xp: updated.xp,
        rank: updated.rank,
        masteryPoints: updated.masteryPoints,
      },
    });

    await tx.playerVocationDailyCap.update({
      where: { playerId: input.playerId },
      data: { dayStart, turnsSpent: updatedTurnsSpent },
    });
    await incrementCounterTx(tx, input.playerId, 'vocation_honed_turns_total', input.turns);
    await incrementCounterTx(tx, input.playerId, `vocation_honed_turns_${input.vocationId}`, input.turns);

    const snapshot = await buildSnapshotTx(tx, input.playerId, now);

    return {
      snapshot,
      vocation: getSnapshotVocation(snapshot, updatedVocation.vocationId),
      turnSpend: spend.turnSpend,
      taxInfo: taxInfoFromResult(spend.taxResult),
      taxResult: spend.taxResult,
    };
  });
}

export async function grantPassiveVocationXpTx(input: {
  tx: Prisma.TransactionClient;
  playerId: string;
  vocationId: VocationId;
  source: PassiveVocationSource;
  baseXp: number;
}): Promise<VocationStateDto> {
  requireVocation(input.vocationId);

  const multiplier = input.source === 'craft'
    ? VOCATION_MASTERY.PASSIVE_CRAFT_XP_MULTIPLIER
    : VOCATION_MASTERY.PASSIVE_GATHER_XP_MULTIPLIER;
  const xpGained = Math.floor(input.baseXp * multiplier);
  if (xpGained <= 0) {
    const current = await findVocationOrDefaultTx(input.tx, input.playerId, input.vocationId);
    return toVocationState(current, []);
  }

  const current = await loadLockedVocationTx(input.tx, input.playerId, input.vocationId);
  const updated = toProgressUpdate(current.xp + xpGained);
  const updatedVocation = await input.tx.playerVocation.upsert({
    where: { playerId_vocationId: { playerId: input.playerId, vocationId: input.vocationId } },
    create: {
      playerId: input.playerId,
      vocationId: input.vocationId,
      xp: updated.xp,
      rank: updated.rank,
      masteryPoints: updated.masteryPoints,
      spentPoints: current.spentPoints,
    },
    update: {
      xp: updated.xp,
      rank: updated.rank,
      masteryPoints: updated.masteryPoints,
    },
  });

  return toVocationState(updatedVocation, []);
}

export async function learnTechnique(input: {
  playerId: string;
  vocationId: VocationId;
  techniqueId: string;
  now?: Date;
}): Promise<VocationActionResult> {
  const now = input.now ?? new Date();
  const vocation = requireVocation(input.vocationId);
  const technique = getTechniqueDefinition(input.techniqueId);

  if (!technique) {
    throw new AppError(404, 'Vocation technique not found', 'TECHNIQUE_NOT_FOUND');
  }
  if (technique.vocationId !== input.vocationId) {
    throw new AppError(400, 'Technique belongs to a different vocation', 'TECHNIQUE_WRONG_VOCATION');
  }

  return prisma.$transaction(async (tx) => {
    await enforceMentorTownTx(tx, input.playerId, vocation.mentorTown);

    const current = await loadLockedVocationTx(tx, input.playerId, input.vocationId);
    if (current.rank < technique.requiredRank) {
      throw new AppError(400, 'Vocation rank is too low for this technique', 'VOCATION_RANK_TOO_LOW');
    }
    if (current.masteryPoints - current.spentPoints < technique.pointCost) {
      throw new AppError(400, 'Not enough vocation mastery points', 'INSUFFICIENT_MASTERY_POINTS');
    }

    const existing = await tx.playerVocationTechnique.findUnique({
      where: {
        playerId_vocationId_techniqueId: {
          playerId: input.playerId,
          vocationId: input.vocationId,
          techniqueId: input.techniqueId,
        },
      },
    });
    if (existing) {
      throw new AppError(409, 'Technique already learned', 'TECHNIQUE_ALREADY_LEARNED');
    }

    await tx.playerVocationTechnique.create({
      data: { playerId: input.playerId, vocationId: input.vocationId, techniqueId: input.techniqueId },
    });
    const updatedVocation = await tx.playerVocation.update({
      where: { playerId_vocationId: { playerId: input.playerId, vocationId: input.vocationId } },
      data: { spentPoints: { increment: technique.pointCost } },
    });

    const snapshot = await buildSnapshotTx(tx, input.playerId, now);

    return {
      snapshot,
      vocation: getSnapshotVocation(snapshot, updatedVocation.vocationId),
    };
  });
}

export async function respecVocation(input: {
  playerId: string;
  vocationId: VocationId;
  now?: Date;
}): Promise<VocationActionResult> {
  const now = input.now ?? new Date();
  const vocation = requireVocation(input.vocationId);

  return prisma.$transaction(async (tx) => {
    await enforceMentorTownTx(tx, input.playerId, vocation.mentorTown);

    const current = await loadLockedVocationTx(tx, input.playerId, input.vocationId);
    if (current.spentPoints <= 0) {
      throw new AppError(400, 'No vocation mastery points to respec', 'NOTHING_TO_RESPEC');
    }

    const newSpentPoints = current.spentPoints - getPartialRespecRefund(current.spentPoints);
    await tx.playerVocationTechnique.deleteMany({
      where: { playerId: input.playerId, vocationId: input.vocationId },
    });
    const updatedVocation = await tx.playerVocation.update({
      where: { playerId_vocationId: { playerId: input.playerId, vocationId: input.vocationId } },
      data: { spentPoints: newSpentPoints },
    });
    await incrementCounterTx(tx, input.playerId, 'vocation_respecs_total', 1);
    await incrementCounterTx(tx, input.playerId, `vocation_respecs_${input.vocationId}`, 1);

    const snapshot = await buildSnapshotTx(tx, input.playerId, now);

    return {
      snapshot,
      vocation: getSnapshotVocation(snapshot, updatedVocation.vocationId),
    };
  });
}

function requireVocation(vocationId: VocationId) {
  if (!VOCATION_ID_SET.has(vocationId)) {
    throw new AppError(400, 'Unknown vocation', 'UNKNOWN_VOCATION');
  }

  const vocation = getVocationDefinition(vocationId);
  if (!vocation) {
    throw new AppError(400, 'Unknown vocation', 'UNKNOWN_VOCATION');
  }

  return vocation;
}

function validateTurns(turns: number): void {
  if (!Number.isInteger(turns) || turns <= 0) {
    throw new AppError(400, 'Turns must be a positive integer', 'INVALID_TURNS');
  }
}

async function enforceMentorTownTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  mentorTown: VocationMentorTown,
): Promise<void> {
  const player = await tx.player.findUnique({
    where: { id: playerId },
    select: {
      currentZone: {
        select: { zoneType: true, name: true },
      },
    },
  });
  const zone = player?.currentZone;

  if (zone?.zoneType !== 'town') {
    throw new AppError(400, 'Must be in a town to use a vocation mentor', 'NOT_IN_TOWN');
  }

  const currentTown = resolveMentorTownFromZoneName(zone.name);
  if (currentTown !== mentorTown) {
    throw new AppError(400, 'Wrong mentor town for this vocation', 'WRONG_MENTOR_TOWN');
  }
}

function resolveMentorTownFromZoneName(zoneName: string): VocationMentorTown | null {
  const normalized = zoneName.toLowerCase();
  if (normalized.includes('millbrook')) return 'millbrook';
  if (normalized.includes('thornwall')) return 'thornwall';
  return null;
}

async function buildSnapshotTx(
  tx: Pick<Prisma.TransactionClient, 'playerVocation' | 'playerVocationTechnique' | 'playerVocationDailyCap'>,
  playerId: string,
  now: Date,
): Promise<VocationSnapshotResponse> {
  const [vocationRows, techniqueRows, dailyCap] = await Promise.all([
    tx.playerVocation.findMany({ where: { playerId } }),
    tx.playerVocationTechnique.findMany({ where: { playerId } }),
    tx.playerVocationDailyCap.findUnique({ where: { playerId } }),
  ]);
  const techniquesByVocation = new Map<VocationId, string[]>();

  for (const technique of techniqueRows) {
    if (!isVocationId(technique.vocationId)) continue;
    const existing = techniquesByVocation.get(technique.vocationId) ?? [];
    existing.push(technique.techniqueId);
    techniquesByVocation.set(technique.vocationId, existing);
  }

  return {
    playerId,
    vocations: VOCATION_IDS.map((vocationId) => {
      const row = vocationRows.find((candidate) => candidate.vocationId === vocationId);
      return toVocationState(row ?? zeroVocationRow(playerId, vocationId), techniquesByVocation.get(vocationId) ?? []);
    }),
    dailyCap: toDailyCapState(dailyCap, getDayStart(now)),
  };
}

async function findVocationOrDefaultTx(
  tx: Pick<Prisma.TransactionClient, 'playerVocation'>,
  playerId: string,
  vocationId: VocationId,
): Promise<PlayerVocation> {
  const existing = await tx.playerVocation.findUnique({
    where: { playerId_vocationId: { playerId, vocationId } },
  });

  return existing ?? zeroVocationRow(playerId, vocationId);
}

async function loadLockedVocationTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  vocationId: VocationId,
): Promise<PlayerVocation> {
  await tx.playerVocation.upsert({
    where: { playerId_vocationId: { playerId, vocationId } },
    create: {
      playerId,
      vocationId,
      xp: 0,
      rank: 1,
      masteryPoints: 0,
      spentPoints: 0,
    },
    update: {},
  });
  await tx.$queryRaw`
    SELECT "player_id", "vocation_id"
    FROM "player_vocations"
    WHERE "player_id" = ${playerId} AND "vocation_id" = ${vocationId}
    FOR UPDATE
  `;

  return findVocationOrDefaultTx(tx, playerId, vocationId);
}

function zeroVocationRow(playerId: string, vocationId: VocationId): PlayerVocation {
  const now = new Date(0);
  return {
    playerId,
    vocationId,
    xp: 0,
    rank: 1,
    masteryPoints: 0,
    spentPoints: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function toProgressUpdate(xp: number): { xp: number; rank: number; masteryPoints: number } {
  const rank = getVocationRankForXp(xp);
  return {
    xp,
    rank,
    masteryPoints: getMasteryPointsForRank(rank),
  };
}

function toVocationState(row: PlayerVocation, learnedTechniqueIds: string[]): VocationStateDto {
  const rank = row.rank > 0 ? row.rank : getVocationRankForXp(row.xp);
  const masteryPointsEarned = row.masteryPoints > 0 ? row.masteryPoints : getMasteryPointsForRank(rank);

  return {
    vocationId: row.vocationId as VocationId,
    xp: row.xp,
    rank,
    xpForCurrentRank: getVocationXpForRank(rank),
    xpForNextRank: getVocationXpForRank(rank + 1),
    masteryPointsEarned,
    availableMasteryPoints: Math.max(0, masteryPointsEarned - row.spentPoints),
    spentPoints: row.spentPoints,
    learnedTechniqueIds,
  };
}

function toDailyCapState(dailyCap: PlayerVocationDailyCap | null, currentDayStart: Date): VocationDailyCapDto {
  const turnsSpent = dailyCap && dailyCap.dayStart.getTime() === currentDayStart.getTime()
    ? dailyCap.turnsSpent
    : 0;

  return {
    dayStart: currentDayStart.toISOString(),
    turnsSpent,
    turnsLimit: VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT,
    turnsRemaining: Math.max(0, VOCATION_MASTERY.DAILY_HONING_TURN_LIMIT - turnsSpent),
  };
}

async function loadLockedDailyCapTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  dayStart: Date,
): Promise<PlayerVocationDailyCap | null> {
  await tx.playerVocationDailyCap.upsert({
    where: { playerId },
    create: { playerId, dayStart, turnsSpent: 0 },
    update: {},
  });
  await tx.$queryRaw`SELECT "player_id" FROM "player_vocation_daily_caps" WHERE "player_id" = ${playerId} FOR UPDATE`;

  return tx.playerVocationDailyCap.findUnique({ where: { playerId } });
}

function getSnapshotVocation(snapshot: VocationSnapshotResponse, vocationId: string): VocationStateDto {
  const vocation = snapshot.vocations.find((candidate) => candidate.vocationId === vocationId);
  if (!vocation) {
    throw new AppError(500, 'Updated vocation missing from snapshot', 'VOCATION_SNAPSHOT_MISMATCH');
  }

  return vocation;
}

function getCurrentDailyTurnsSpent(dailyCap: PlayerVocationDailyCap | null, currentDayStart: Date): number {
  if (!dailyCap || dailyCap.dayStart.getTime() !== currentDayStart.getTime()) {
    return 0;
  }

  return dailyCap.turnsSpent;
}

async function incrementCounterTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  statKey: string,
  increment: number,
): Promise<void> {
  await tx.playerVocationCounter.upsert({
    where: { playerId_statKey: { playerId, statKey } },
    create: { playerId, statKey, value: increment },
    update: { value: { increment } },
  });
}

function isVocationId(value: string): value is VocationId {
  return VOCATION_ID_SET.has(value);
}
