import { Prisma, prisma } from '@pocketrealm/database';
import { AppError } from '../middleware/errorHandler';
import { refreshSeasonCache } from './seasonCacheService';
import { SEASON_STATUSES } from './season.constants';

function isSerializableConflict(error: unknown): boolean {
  const knownRequestError = (Prisma as typeof Prisma & {
    PrismaClientKnownRequestError?: new (...args: never[]) => { code?: string };
  }).PrismaClientKnownRequestError;

  return typeof knownRequestError === 'function'
    && error instanceof knownRequestError
    && error.code === 'P2034';
}

function runSerializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const isolationLevel = Prisma.TransactionIsolationLevel?.Serializable;

  if (!isolationLevel) {
    return prisma.$transaction(operation);
  }

  return prisma.$transaction(operation, { isolationLevel });
}

type SeasonBootstrappedReadClient = Pick<
  Prisma.TransactionClient,
  'zone' | 'itemTemplate' | 'mobTemplate' | 'craftingRecipe'
>;

export async function isSeasonBootstrapped(
  db: SeasonBootstrappedReadClient,
  seasonId: string,
): Promise<boolean> {
  const [starterZone, itemTemplate, mobTemplate, craftingRecipe] = await Promise.all([
    db.zone.findFirst({
      where: { seasonId, isStarter: true },
      select: { id: true },
    }),
    db.itemTemplate.findFirst({
      where: { seasonId },
      select: { id: true },
    }),
    db.mobTemplate.findFirst({
      where: { seasonId },
      select: { id: true },
    }),
    db.craftingRecipe.findFirst({
      where: { seasonId },
      select: { id: true },
    }),
  ]);

  return Boolean(starterZone && itemTemplate && mobTemplate && craftingRecipe);
}

export async function activateSeason(seasonId: string): Promise<{ id: string; name: string; status: string }> {
  try {
    const season = await runSerializableTransaction(async (tx) => {
      await tx.season.findUniqueOrThrow({
        where: { id: seasonId },
        select: { id: true },
      });

      const bootstrapped = await isSeasonBootstrapped(tx, seasonId);
      if (!bootstrapped) {
        throw new AppError(400, 'Season must be bootstrapped before activation', 'SEASON_NOT_BOOTSTRAPPED');
      }

      const activeSeason = await tx.season.findFirst({
        where: { status: SEASON_STATUSES.ACTIVE },
        select: { id: true },
      });

      if (activeSeason && activeSeason.id !== seasonId) {
        throw new AppError(409, 'Another season is already active', 'ACTIVE_SEASON_EXISTS');
      }

      return tx.season.update({
        where: { id: seasonId },
        data: { status: SEASON_STATUSES.ACTIVE },
      });
    });

    await refreshSeasonCache();
    return season;
  } catch (error) {
    if (isSerializableConflict(error)) {
      throw new AppError(409, 'Another season is already active', 'ACTIVE_SEASON_EXISTS');
    }

    throw error;
  }
}

export async function endSeason(seasonId: string): Promise<{ id: string; name: string; status: string }> {
  const result = await runSerializableTransaction(async (tx) => {
    const season = await tx.season.findUniqueOrThrow({
      where: { id: seasonId },
    });
    if (season.status !== SEASON_STATUSES.ACTIVE) {
      throw new AppError(400, 'Season is not active', 'SEASON_NOT_ACTIVE');
    }

    const endedSeason = await tx.season.update({
      where: { id: seasonId },
      data: { status: SEASON_STATUSES.ENDED },
    });

    const seasonalZoneIds = await tx.zone.findMany({
      where: { seasonId },
      select: { id: true },
    });
    if (seasonalZoneIds.length > 0) {
      await tx.worldEvent.updateMany({
        where: {
          status: 'active',
          zoneId: { in: seasonalZoneIds.map((zone) => zone.id) },
        },
        data: { status: 'cancelled' },
      });
    }

    return endedSeason;
  });

  await refreshSeasonCache();
  return result;
}
