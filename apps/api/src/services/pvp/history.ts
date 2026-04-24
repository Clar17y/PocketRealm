import { prisma } from '@pocketrealm/database';
import { AppError } from '../../middleware/errorHandler';
import { buildPagination } from '../../utils/routeHelpers.js';

export async function getHistory(playerId: string, page: number, pageSize: number) {
  const where = {
    OR: [{ attackerId: playerId }, { defenderId: playerId }],
  };

  const [matches, total] = await Promise.all([
    prisma.pvpMatch.findMany({
      where,
      select: {
        id: true,
        attackerId: true,
        defenderId: true,
        attackerRating: true,
        defenderRating: true,
        attackerRatingChange: true,
        defenderRatingChange: true,
        attackerStyle: true,
        defenderStyle: true,
        winnerId: true,
        isRevenge: true,
        turnsSpent: true,
        createdAt: true,
        attacker: { select: { username: true } },
        defender: { select: { username: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pvpMatch.count({ where }),
  ]);

  return {
    matches: matches.map((match) => ({
      matchId: match.id,
      attackerId: match.attackerId,
      attackerName: match.attacker.username,
      defenderId: match.defenderId,
      defenderName: match.defender.username,
      winnerId: match.winnerId,
      attackerRating: match.attackerRating,
      defenderRating: match.defenderRating,
      attackerRatingChange: match.attackerRatingChange,
      defenderRatingChange: match.defenderRatingChange,
      attackerStyle: match.attackerStyle,
      defenderStyle: match.defenderStyle,
      isRevenge: match.isRevenge,
      turnsSpent: match.turnsSpent,
      createdAt: match.createdAt.toISOString(),
    })),
    pagination: buildPagination(page, pageSize, total),
  };
}

export async function getMatchDetail(playerId: string, matchId: string) {
  const match = await prisma.pvpMatch.findUnique({
    where: { id: matchId },
    include: {
      attacker: { select: { username: true } },
      defender: { select: { username: true } },
    },
  });

  if (!match) {
    throw new AppError(404, 'Match not found', 'NOT_FOUND');
  }
  if (match.attackerId !== playerId && match.defenderId !== playerId) {
    throw new AppError(403, 'Not authorized to view this match', 'FORBIDDEN');
  }

  return {
    matchId: match.id,
    attackerId: match.attackerId,
    attackerName: match.attacker.username,
    defenderId: match.defenderId,
    defenderName: match.defender.username,
    winnerId: match.winnerId,
    attackerRating: match.attackerRating,
    defenderRating: match.defenderRating,
    attackerRatingChange: match.attackerRatingChange,
    defenderRatingChange: match.defenderRatingChange,
    attackerStyle: match.attackerStyle,
    defenderStyle: match.defenderStyle,
    isRevenge: match.isRevenge,
    turnsSpent: match.turnsSpent,
    createdAt: match.createdAt.toISOString(),
    combatLog: match.combatLog,
  };
}
