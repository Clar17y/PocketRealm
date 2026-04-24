import { Prisma, prisma } from '@pocketrealm/database';
import { AppError } from '../../middleware/errorHandler';
import { bootstrapSeason } from '../seasonBootstrapService';
import { runSeasonMerge } from '../seasonMergeService';
import { evaluateSeasonRewards } from '../seasonRewardService';
import { activateSeason, endSeason, isSeasonBootstrapped } from '../seasonLifecycleService';
import { SEASON_STATUSES } from '../season.constants';
import { adminAudit } from './adminAuditService';

export interface CreateAdminSeasonInput {
  name: string;
  startsAt: string;
  endsAt: string;
  constantOverrides?: Record<string, Record<string, number>>;
  features?: string[];
}

export async function listAdminSeasons() {
  const seasons = await prisma.season.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return Promise.all(
    seasons.map(async (season) => ({
      ...season,
      isBootstrapped: await isSeasonBootstrapped(prisma, season.id),
    })),
  );
}

export async function createAdminSeason(adminId: string, input: CreateAdminSeasonInput) {
  const season = await prisma.season.create({
    data: {
      name: input.name,
      status: 'upcoming',
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      constantOverrides: (input.constantOverrides ?? null) as unknown as Prisma.InputJsonValue,
      features: input.features ?? [],
    },
  });

  await adminAudit(adminId, 'create_season', {
    seasonId: season.id,
    name: season.name,
  });

  return season;
}

export async function bootstrapAdminSeason(adminId: string, seasonId: string) {
  const result = await bootstrapSeason(seasonId);
  await adminAudit(adminId, 'bootstrap_season', result);
  return result;
}

export async function activateAdminSeason(adminId: string, seasonId: string) {
  const season = await activateSeason(seasonId);
  await adminAudit(adminId, 'activate_season', {
    seasonId: season.id,
    name: season.name,
  });
  return season;
}

export async function endAdminSeason(adminId: string, seasonId: string) {
  const season = await endSeason(seasonId);
  await adminAudit(adminId, 'end_season', {
    seasonId,
    name: season.name,
  });
  return season;
}

export async function evaluateAdminSeasonRewards(adminId: string, seasonId: string) {
  const season = await prisma.season.findUniqueOrThrow({
    where: { id: seasonId },
    select: { id: true, status: true },
  });

  if (season.status !== SEASON_STATUSES.ENDED) {
    throw new AppError(400, 'Season must be ended before evaluating rewards', 'SEASON_NOT_ENDED');
  }

  const result = await evaluateSeasonRewards(seasonId);
  await adminAudit(adminId, 'evaluate_season_rewards', {
    seasonId,
    hallOfFameEntries: result.entries,
  });

  return result;
}

export async function mergeAdminSeason(adminId: string, seasonId: string) {
  const result = await runSeasonMerge(seasonId);
  await adminAudit(adminId, 'merge_season', {
    seasonId,
    merged: result.merged,
    errors: result.errors,
  });
  return result;
}
