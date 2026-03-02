import { prisma } from '@adventure/database';
import { CASINO_CONSTANTS, getNumberColor } from '@adventure/shared';
import { spendPlayerTurnsTx } from './turnBankService';
import { AppError } from '../middleware/errorHandler';
import { redis } from '../redis';
import { getIo } from '../socket';
import {
  isWinningBet,
  calculatePayout,
  validateBet,
  generateSpinResult,
} from '@adventure/game-engine';
import type {
  RouletteBetType,
  RouletteRoundState,
  RoulettePublicBet,
  CasinoBetEvent,
  CasinoResultEvent,
  CasinoPhaseEvent,
} from '@adventure/shared';

export interface GoldExchangeResult {
  turnsSpent: number;
  goldGained: number;
  goldBalance: number;
  turnsRemaining: number;
}

export async function exchangeTurnsForGold(
  playerId: string,
  turns: number,
): Promise<GoldExchangeResult> {
  if (!Number.isInteger(turns) || turns <= 0) {
    throw new AppError(400, 'Turns must be a positive integer', 'INVALID_AMOUNT');
  }

  const goldGained = turns * CASINO_CONSTANTS.GOLD_EXCHANGE_RATE;

  return prisma.$transaction(async (tx) => {
    const turnResult = await spendPlayerTurnsTx(tx, playerId, turns);

    const player = await tx.player.update({
      where: { id: playerId },
      data: { gold: { increment: goldGained } },
      select: { gold: true },
    });

    return {
      turnsSpent: turns,
      goldGained,
      goldBalance: player.gold,
      turnsRemaining: turnResult.currentTurns,
    };
  });
}

// -- Roulette Round Management --

const ROUND_KEY = 'roulette:current_round';

interface ActiveRound {
  roundId: string;
  startedAt: number;
}

async function getOrCreateRound(): Promise<{ roundId: string; startedAt: number; isNew: boolean }> {
  const existing = await redis.get(ROUND_KEY);
  if (existing) {
    const parsed: ActiveRound = JSON.parse(existing);
    const elapsed = Date.now() - parsed.startedAt;
    if (elapsed < CASINO_CONSTANTS.ROUND_DURATION_SECONDS * 1000) {
      return { ...parsed, isNew: false };
    }
    await resolveRound(parsed.roundId);
  }

  const round = await prisma.rouletteRound.create({ data: {} });
  const active: ActiveRound = { roundId: round.id, startedAt: Date.now() };
  await redis.set(
    ROUND_KEY,
    JSON.stringify(active),
    'EX',
    CASINO_CONSTANTS.ROUND_DURATION_SECONDS + 10,
  );
  return { ...active, isNew: true };
}

async function resolveRound(roundId: string): Promise<number> {
  // Acquire lock to prevent concurrent resolution
  const lockKey = `roulette:lock:${roundId}`;
  const acquired = await redis.set(lockKey, '1', 'EX', 30, 'NX');
  if (!acquired) {
    // Another process is resolving — wait and fetch result from DB
    const round = await prisma.rouletteRound.findUnique({
      where: { id: roundId },
      select: { result: true },
    });
    return round?.result ?? 0;
  }

  const result = generateSpinResult();

  const bets = await prisma.rouletteBet.findMany({
    where: { roundId },
    include: { player: { select: { username: true } } },
  });

  const updates = bets.map((bet) => {
    const won = isWinningBet(bet.betType as RouletteBetType, bet.betValue, result);
    const payout = won ? calculatePayout(bet.betType as RouletteBetType, bet.amount) : 0;
    return { id: bet.id, playerId: bet.playerId, payout, won, username: bet.player.username, betType: bet.betType, betValue: bet.betValue, amount: bet.amount };
  });

  await prisma.$transaction(async (tx) => {
    await tx.rouletteRound.update({
      where: { id: roundId },
      data: { result, resolvedAt: new Date() },
    });

    for (const u of updates) {
      await tx.rouletteBet.update({
        where: { id: u.id },
        data: { payout: u.payout },
      });
    }

    const winnerTotals = new Map<string, number>();
    for (const u of updates) {
      if (u.payout > 0) {
        winnerTotals.set(u.playerId, (winnerTotals.get(u.playerId) ?? 0) + u.payout);
      }
    }
    for (const [playerId, total] of winnerTotals) {
      await tx.player.update({
        where: { id: playerId },
        data: { gold: { increment: total } },
      });
    }
  });

  const io = getIo();
  if (io) {
    const winningBets = updates
      .filter((b) => b.won)
      .map((b) => ({
        playerName: b.username,
        betType: b.betType as RouletteBetType,
        betValue: b.betValue,
        amount: b.amount,
        payout: b.payout,
      }));
    const resultEvent: CasinoResultEvent = {
      result,
      color: getNumberColor(result),
      winningBets,
    };
    io.to('chat:casino').emit('casino:result', resultEvent);
  }

  await redis.del(ROUND_KEY);
  return result;
}

async function emitPhaseIfChanged(
  phase: CasinoPhaseEvent['phase'],
  roundId: string,
  timeRemainingMs: number,
  result?: number,
): Promise<void> {
  const io = getIo();
  if (!io) return;

  const phaseKey = `roulette:last_phase`;
  const lastPhase = await redis.get(phaseKey);
  if (lastPhase === phase) return;

  await redis.set(phaseKey, phase, 'EX', CASINO_CONSTANTS.ROUND_DURATION_SECONDS + 10);

  const phaseEvent: CasinoPhaseEvent = {
    phase,
    roundId,
    timeRemainingMs,
    result: phase === 'result' ? result : undefined,
    bets: phase === 'betting' ? await getPublicBets(roundId) : undefined,
  };
  io.to('chat:casino').emit('casino:phase', phaseEvent);
}

export async function getCurrentRound(): Promise<RouletteRoundState> {
  const existing = await redis.get(ROUND_KEY);
  if (!existing) {
    // Auto-start a new round so the casino never stalls in idle
    const { roundId, startedAt } = await getOrCreateRound();
    const totalMs = CASINO_CONSTANTS.ROUND_DURATION_SECONDS * 1000;
    await emitPhaseIfChanged('betting', roundId, totalMs);
    return {
      roundId,
      phase: 'betting',
      result: null,
      startedAt: new Date(startedAt).toISOString(),
      timeRemainingMs: totalMs,
      bets: [],
    };
  }

  const parsed: ActiveRound = JSON.parse(existing);
  const elapsed = Date.now() - parsed.startedAt;
  const totalMs = CASINO_CONSTANTS.ROUND_DURATION_SECONDS * 1000;
  const bettingMs = CASINO_CONSTANTS.BETTING_WINDOW_SECONDS * 1000;

  if (elapsed >= totalMs) {
    const resolvedResult = await resolveRound(parsed.roundId);
    await emitPhaseIfChanged('result', parsed.roundId, 0, resolvedResult);
    return {
      roundId: parsed.roundId,
      phase: 'result',
      result: resolvedResult,
      startedAt: new Date(parsed.startedAt).toISOString(),
      timeRemainingMs: 0,
      bets: await getPublicBets(parsed.roundId),
    };
  }

  const phase = elapsed < bettingMs ? 'betting' : 'spinning';
  const timeRemainingMs = totalMs - elapsed;
  await emitPhaseIfChanged(phase, parsed.roundId, timeRemainingMs);

  return {
    roundId: parsed.roundId,
    phase,
    result: null,
    startedAt: new Date(parsed.startedAt).toISOString(),
    timeRemainingMs,
    bets: await getPublicBets(parsed.roundId),
  };
}

async function getPublicBets(roundId: string): Promise<RoulettePublicBet[]> {
  const bets = await prisma.rouletteBet.findMany({
    where: { roundId },
    include: { player: { select: { username: true } } },
  });
  return bets.map((b) => ({
    playerName: b.player.username,
    betType: b.betType as RouletteBetType,
    betValue: b.betValue,
    amount: b.amount,
  }));
}

export async function placeBet(
  playerId: string,
  betType: RouletteBetType,
  betValue: string,
  amount: number,
): Promise<{ roundId: string; goldRemaining: number }> {
  const validation = validateBet(betType, betValue, amount);
  if (!validation.valid) {
    throw new AppError(400, validation.error!, 'INVALID_BET');
  }

  const { roundId, startedAt } = await getOrCreateRound();

  const elapsed = Date.now() - startedAt;
  if (elapsed >= CASINO_CONSTANTS.BETTING_WINDOW_SECONDS * 1000) {
    throw new AppError(400, 'Betting window closed', 'BETTING_CLOSED');
  }

  const result = await prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id: playerId },
      select: { gold: true, username: true },
    });
    if (!player || player.gold < amount) {
      throw new AppError(400, 'Insufficient gold', 'INSUFFICIENT_GOLD');
    }

    await tx.player.update({
      where: { id: playerId },
      data: { gold: { decrement: amount } },
    });

    await tx.rouletteBet.create({
      data: { roundId, playerId, betType, betValue, amount },
    });

    return { roundId, goldRemaining: player.gold - amount, username: player.username };
  });

  const io = getIo();
  if (io) {
    const betEvent: CasinoBetEvent = {
      playerName: result.username,
      playerId,
      betType,
      betValue,
      amount,
    };
    io.to('chat:casino').emit('casino:bet', betEvent);
  }

  return result;
}

export async function getRouletteHistory(): Promise<{ spinNumber: number; result: number; resolvedAt: string }[]> {
  const rounds = await prisma.rouletteRound.findMany({
    where: { result: { not: null } },
    orderBy: { resolvedAt: 'desc' },
    take: CASINO_CONSTANTS.ROULETTE_HISTORY_LENGTH,
    select: { spinNumber: true, result: true, resolvedAt: true },
  });
  return rounds.map((r) => ({
    spinNumber: r.spinNumber,
    result: r.result!,
    resolvedAt: r.resolvedAt!.toISOString(),
  }));
}
