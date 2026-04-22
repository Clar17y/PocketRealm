import { prisma } from '@pocketrealm/database';
import { WORLD_EVENT_CONSTANTS, type BossEncounterData, type BossParticipantData } from '@pocketrealm/shared';
import { AppError } from '../../middleware/errorHandler';
import { spendPlayerTurnsTx } from '../turnBankService';
import { roundTimerRegistry } from '../roundTimerRegistry';
import { getIo } from '../../socket';
import { computeResourcePools, toBossEncounterData, toBossParticipantData } from './shared';

export async function createBossEncounter(
  eventId: string,
  mobTemplateId: string,
  baseHp: number,
): Promise<BossEncounterData> {
  const nextRoundAt = new Date(
    Date.now() + WORLD_EVENT_CONSTANTS.BOSS_INITIAL_WAIT_MINUTES * 60 * 1000,
  );

  const row = await prisma.bossEncounter.create({
    data: {
      eventId,
      mobTemplateId,
      currentHp: baseHp,
      maxHp: baseHp,
      baseHp,
      roundNumber: 0,
      nextRoundAt,
      status: 'waiting',
    },
  });

  return toBossEncounterData(row);
}

export async function signUpForBossRound(
  encounterId: string,
  playerId: string,
  playerCurrentHp: number,
  autoSignUp = false,
): Promise<BossParticipantData> {
  const turnCost = WORLD_EVENT_CONSTANTS.BOSS_SIGNUP_TURN_COST;
  const encounter = await prisma.bossEncounter.findUnique({
    where: { id: encounterId },
  });
  if (!encounter) {
    throw new AppError(404, 'Boss encounter not found', 'NOT_FOUND');
  }
  if (encounter.status === 'defeated' || encounter.status === 'expired') {
    throw new AppError(410, 'Boss encounter is already over', 'ENCOUNTER_ENDED');
  }

  const nextRound = encounter.roundNumber + 1;
  const existing = await prisma.bossParticipant.findUnique({
    where: {
      encounterId_playerId_roundNumber: {
        encounterId,
        playerId,
        roundNumber: nextRound,
      },
    },
  });

  let row;
  if (existing) {
    row = await prisma.bossParticipant.update({
      where: { id: existing.id },
      data: { autoSignUp },
    });
  } else {
    const { maxStamina, maxMana } = await computeResourcePools(playerId);

    row = await prisma.$transaction(async (tx) => {
      await spendPlayerTurnsTx(tx, playerId, turnCost);

      return tx.bossParticipant.create({
        data: {
          encounterId,
          playerId,
          roundNumber: nextRound,
          turnsCommitted: turnCost,
          currentHp: playerCurrentHp,
          currentStamina: maxStamina,
          currentMana: maxMana,
          status: 'alive',
          autoSignUp,
        },
      });
    });
  }

  if (encounter.status === 'waiting') {
    await prisma.bossEncounter.update({
      where: { id: encounterId },
      data: { status: 'in_progress' },
    });
    if (encounter.nextRoundAt) {
      roundTimerRegistry.schedule('bossEncounter', encounterId, encounter.nextRoundAt, getIo);
    }
  }

  return toBossParticipantData(row);
}
