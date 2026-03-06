import { prisma } from '@pocketrealm/database';
import { SPAR_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { isBlocked } from './blockService';
import { getHpState } from './hpService';
import { spendPlayerTurnsTx } from './turnBankService';
import { sendSystemMail } from './friendMailService';

interface SparValidation {
  attackerId: string;
  defenderId: string;
}

export async function validateSpar(
  attackerId: string,
  friendshipId: string,
): Promise<SparValidation> {
  const friendship = await prisma.friendship.findFirst({
    where: {
      id: friendshipId,
      status: 'accepted',
      OR: [{ senderId: attackerId }, { receiverId: attackerId }],
    },
    select: { senderId: true, receiverId: true },
  });
  if (!friendship) {
    throw new AppError(404, 'Friendship not found', 'NOT_FOUND');
  }

  const defenderId = friendship.senderId === attackerId
    ? friendship.receiverId
    : friendship.senderId;

  // HP check
  const hpState = await getHpState(attackerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot spar while recovering', 'IS_RECOVERING');
  }

  // Block check
  if (await isBlocked(defenderId, attackerId)) {
    throw new AppError(400, 'Cannot spar with this player', 'BLOCKED');
  }

  return { attackerId, defenderId };
}

export async function spendSparTurns(attackerId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await spendPlayerTurnsTx(tx, attackerId, SPAR_CONSTANTS.TURN_COST);
  });
}

export async function sendSparResultMail(
  attackerId: string,
  attackerName: string,
  defenderId: string,
  attackerWon: boolean,
  winnerHp: number,
): Promise<void> {
  const subject = 'Friendly Spar Result';
  const body = attackerWon
    ? `${attackerName} beat you in a friendly spar! They ended on ${winnerHp} HP.`
    : `${attackerName} lost to you in a friendly spar! You showed them who's boss.`;

  await sendSystemMail(attackerId, defenderId, subject, body);
}
