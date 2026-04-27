import { prisma } from '@pocketrealm/database';
import { SEASON_STATUSES } from '@pocketrealm/shared';

export interface PublicSeasonArchiveSummary {
  id: string;
  name: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
}

export interface PublicActiveSeason {
  id: string;
  name: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  constantOverrides: unknown;
  features: unknown;
}

export interface PublicHallOfFameEntry {
  category: string;
  rank: number;
  username: string;
  value: number;
  createdAt: Date;
}

export async function getPublicActiveSeason(): Promise<PublicActiveSeason | null> {
  return prisma.season.findFirst({
    where: { status: SEASON_STATUSES.ACTIVE },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
      constantOverrides: true,
      features: true,
    },
    orderBy: { startsAt: 'desc' },
  });
}

export async function getPublicSeasonArchives(): Promise<PublicSeasonArchiveSummary[]> {
  return prisma.season.findMany({
    where: {
      status: { in: [SEASON_STATUSES.ENDED, SEASON_STATUSES.ARCHIVED] },
    },
    select: {
      id: true,
      name: true,
      status: true,
      startsAt: true,
      endsAt: true,
    },
    orderBy: { endsAt: 'desc' },
  });
}

export async function getPublicHallOfFameEntries(seasonId: string): Promise<PublicHallOfFameEntry[]> {
  return prisma.hallOfFameEntry.findMany({
    where: { seasonId },
    select: {
      category: true,
      rank: true,
      username: true,
      value: true,
      createdAt: true,
    },
    orderBy: [
      { category: 'asc' },
      { rank: 'asc' },
    ],
  });
}
