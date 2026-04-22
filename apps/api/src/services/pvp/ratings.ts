import { prisma } from '@pocketrealm/database';
import {
  PVP_CONSTANTS,
  resolveAchievementTitleDisplay,
} from '@pocketrealm/shared';
import { safeUpsert } from '../../utils/safeUpsert';

export function computeBracketBounds(rating: number): { lower: number; upper: number } {
  const percentLower = Math.floor(rating * (1 - PVP_CONSTANTS.BRACKET_RANGE));
  const percentUpper = Math.ceil(rating * (1 + PVP_CONSTANTS.BRACKET_RANGE));

  return {
    lower: Math.max(0, Math.min(percentLower, rating - PVP_CONSTANTS.MIN_BRACKET_HALF_WIDTH)),
    upper: Math.max(percentUpper, rating + PVP_CONSTANTS.MIN_BRACKET_HALF_WIDTH),
  };
}

export async function getOrCreateRating(playerId: string) {
  return safeUpsert(
    () => prisma.pvpRating.upsert({
      where: { playerId },
      update: {},
      create: {
        playerId,
        rating: PVP_CONSTANTS.STARTING_RATING,
        bestRating: PVP_CONSTANTS.STARTING_RATING,
      },
    }),
    () => prisma.pvpRating.findUniqueOrThrow({ where: { playerId } }),
  );
}

export async function getLadder(playerId: string) {
  const myRating = await getOrCreateRating(playerId);
  const { lower: lowerBound, upper: upperBound } = computeBracketBounds(myRating.rating);
  const isAdmin = (await prisma.player.findUnique({
    where: { id: playerId },
    select: { role: true },
  }))?.role === 'admin';

  const cooldowns = isAdmin
    ? []
    : await prisma.pvpCooldown.findMany({
      where: { attackerId: playerId, expiresAt: { gt: new Date() } },
      select: { defenderId: true },
    });
  const cooldownIds = new Set(cooldowns.map((cooldown) => cooldown.defenderId));

  const maxExpansion = PVP_CONSTANTS.BRACKET_WIDEN_STEP * PVP_CONSTANTS.BRACKET_MAX_WIDEN_ITERATIONS;
  const widestLower = Math.max(0, lowerBound - maxExpansion);
  const widestUpper = upperBound + maxExpansion;

  const candidates = await prisma.pvpRating.findMany({
    where: {
      playerId: { not: playerId },
      rating: { gte: widestLower, lte: widestUpper },
      player: { characterLevel: { gte: PVP_CONSTANTS.MIN_CHARACTER_LEVEL } },
    },
    include: {
      player: { select: { username: true, characterLevel: true, role: true, activeTitle: true } },
    },
    orderBy: { rating: 'desc' },
  });

  const allEligible = candidates
    .filter((candidate) => !cooldownIds.has(candidate.playerId))
    .map((candidate) => ({
      playerId: candidate.playerId,
      username: candidate.player.username,
      rating: candidate.rating,
      characterLevel: candidate.player.characterLevel,
      isAdmin: candidate.player.role === 'admin',
      ...resolveAchievementTitleDisplay(candidate.player.activeTitle),
    }));

  let currentLower = lowerBound;
  let currentUpper = upperBound;
  let opponents = allEligible.filter((opponent) => opponent.rating >= currentLower && opponent.rating <= currentUpper);

  let widenCount = 0;
  while (
    opponents.length < PVP_CONSTANTS.MIN_OPPONENTS_SHOWN
    && widenCount < PVP_CONSTANTS.BRACKET_MAX_WIDEN_ITERATIONS
  ) {
    widenCount += 1;
    currentLower = Math.max(0, currentLower - PVP_CONSTANTS.BRACKET_WIDEN_STEP);
    currentUpper += PVP_CONSTANTS.BRACKET_WIDEN_STEP;
    opponents = allEligible.filter((opponent) => opponent.rating >= currentLower && opponent.rating <= currentUpper);
  }

  return {
    myRating: {
      rating: myRating.rating,
      wins: myRating.wins,
      losses: myRating.losses,
      draws: myRating.draws,
      winStreak: myRating.winStreak,
      bestRating: myRating.bestRating,
    },
    opponents,
  };
}
