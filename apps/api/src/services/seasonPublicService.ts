import { prisma } from '@pocketrealm/database';
import { SEASON_STATUSES } from './season.constants';

export interface PublicSeasonArchiveSummary {
  id: string;
  name: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
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
