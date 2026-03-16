import { Prisma, prisma } from '@pocketrealm/database';
import { calculateCurrentTurns, calculateTimeToCapMs, spendTurns } from '@pocketrealm/game-engine';
import { TURN_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';

export interface TurnState {
  currentTurns: number;
  timeToCapMs: number | null;
  lastRegenAt: string;
}

export async function getTurnState(playerId: string, now: Date = new Date()): Promise<TurnState> {
  const turnBank = await prisma.turnBank.findUnique({ where: { playerId } });

  if (!turnBank) {
    throw new AppError(404, 'Turn bank not found', 'NOT_FOUND');
  }

  const currentTurns = calculateCurrentTurns(turnBank.currentTurns, turnBank.lastRegenAt, now);
  const timeToCapMs = calculateTimeToCapMs(currentTurns);

  return {
    currentTurns,
    timeToCapMs,
    lastRegenAt: turnBank.lastRegenAt.toISOString(),
  };
}

export interface SpendTurnsResult {
  previousTurns: number;
  spent: number;
  currentTurns: number;
  lastRegenAt: string;
  timeToCapMs: number | null;
}

interface TurnBankClient {
  turnBank: {
    findUnique: Prisma.TransactionClient['turnBank']['findUnique'];
    updateMany: Prisma.TransactionClient['turnBank']['updateMany'];
  };
}

async function spendPlayerTurnsWithClient(
  client: TurnBankClient,
  playerId: string,
  amount: number,
  now: Date = new Date()
): Promise<SpendTurnsResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(400, 'Turn spend amount must be a positive integer', 'INVALID_TURNS');
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const turnBank = await client.turnBank.findUnique({ where: { playerId } });

    if (!turnBank) {
      throw new AppError(404, 'Turn bank not found', 'NOT_FOUND');
    }

    const previousTurns = calculateCurrentTurns(turnBank.currentTurns, turnBank.lastRegenAt, now);
    const newBalance = spendTurns(previousTurns, amount);

    if (newBalance === null) {
      throw new AppError(400, 'Insufficient turns', 'INSUFFICIENT_TURNS');
    }

    const updated = await client.turnBank.updateMany({
      where: {
        playerId,
        currentTurns: turnBank.currentTurns,
        lastRegenAt: turnBank.lastRegenAt,
      },
      data: {
        currentTurns: newBalance,
        lastRegenAt: now,
      },
    });

    if (updated.count !== 1) {
      continue;
    }

    const timeToCapMs = calculateTimeToCapMs(newBalance);

    return {
      previousTurns,
      spent: amount,
      currentTurns: newBalance,
      lastRegenAt: now.toISOString(),
      timeToCapMs,
    };
  }

  throw new AppError(409, 'Turn bank state changed; try again', 'TURN_STATE_CHANGED');
}

export async function spendPlayerTurns(
  playerId: string,
  amount: number,
  now: Date = new Date()
): Promise<SpendTurnsResult> {
  return spendPlayerTurnsWithClient(prisma, playerId, amount, now);
}

export async function spendPlayerTurnsTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  amount: number,
  now: Date = new Date()
): Promise<SpendTurnsResult> {
  return spendPlayerTurnsWithClient(tx, playerId, amount, now);
}

export interface RefundTurnsResult {
  previousTurns: number;
  refunded: number;
  currentTurns: number;
  lastRegenAt: string;
  timeToCapMs: number | null;
}

async function refundPlayerTurnsWithClient(
  client: TurnBankClient,
  playerId: string,
  amount: number,
  now: Date = new Date()
): Promise<RefundTurnsResult> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new AppError(400, 'Turn refund amount must be a positive integer', 'INVALID_TURNS');
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const turnBank = await client.turnBank.findUnique({ where: { playerId } });

    if (!turnBank) {
      throw new AppError(404, 'Turn bank not found', 'NOT_FOUND');
    }

    const previousTurns = calculateCurrentTurns(turnBank.currentTurns, turnBank.lastRegenAt, now);
    const newBalance = Math.min(TURN_CONSTANTS.BANK_CAP, previousTurns + amount);

    const updated = await client.turnBank.updateMany({
      where: {
        playerId,
        currentTurns: turnBank.currentTurns,
        lastRegenAt: turnBank.lastRegenAt,
      },
      data: {
        currentTurns: newBalance,
        lastRegenAt: now,
      },
    });

    if (updated.count !== 1) {
      continue;
    }

    const timeToCapMs = calculateTimeToCapMs(newBalance);

    return {
      previousTurns,
      refunded: amount,
      currentTurns: newBalance,
      lastRegenAt: now.toISOString(),
      timeToCapMs,
    };
  }

  throw new AppError(409, 'Turn bank state changed; try again', 'TURN_STATE_CHANGED');
}

export async function refundPlayerTurns(
  playerId: string,
  amount: number,
  now: Date = new Date()
): Promise<RefundTurnsResult> {
  return refundPlayerTurnsWithClient(prisma, playerId, amount, now);
}

export async function refundPlayerTurnsTx(
  tx: Prisma.TransactionClient,
  playerId: string,
  amount: number,
  now: Date = new Date()
): Promise<RefundTurnsResult> {
  return refundPlayerTurnsWithClient(tx, playerId, amount, now);
}
