import { fetchApi } from './core';

export interface ActiveSeasonResponse {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
  constantOverrides: Record<string, unknown> | null;
  features: string[] | null;
}

export interface HallOfFameEntryResponse {
  category: string;
  rank: number;
  accountId: string;
  username: string;
  value: number;
  createdAt: string;
}

export interface PublicSeasonArchiveSummary {
  id: string;
  name: string;
  status: string;
  startsAt: string;
  endsAt: string;
}

export async function getActiveSeason() {
  return fetchApi<{ season: ActiveSeasonResponse | null }>('/api/v1/seasons/active', { auth: 'omit' });
}

export async function getPublicSeasonArchives() {
  return fetchApi<{ archives: PublicSeasonArchiveSummary[] }>('/api/v1/seasons/archives', { auth: 'omit' });
}

export async function getHallOfFame(seasonId: string) {
  return fetchApi<{ entries: HallOfFameEntryResponse[] }>(`/api/v1/seasons/${seasonId}/hall-of-fame`, { auth: 'omit' });
}
