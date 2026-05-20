import { useCallback, useEffect, useRef, useState } from 'react';
import { getEncounterSites, type EncounterSitesQuery, type EncounterSitesResponse } from '@/lib/api';
import { useVisibleInterval } from '@/hooks/usePageVisible';
import type { Screen, PendingEncounter } from '../gameController.types';

const PENDING_ENCOUNTER_PAGE_SIZE = 8;

export interface RefreshPendingEncounterOptions {
  background?: boolean;
  includeEncounterSiteId?: string;
}

function mapEncounterSites(sites: EncounterSitesResponse['encounterSites']): PendingEncounter[] {
  return sites.map((site) => ({
    encounterSiteId: site.encounterSiteId,
    zoneId: site.zoneId,
    zoneName: site.zoneName,
    mobFamilyId: site.mobFamilyId,
    mobFamilyName: site.mobFamilyName,
    siteName: site.siteName,
    size: site.size,
    totalMobs: site.totalMobs,
    aliveMobs: site.aliveMobs,
    defeatedMobs: site.defeatedMobs,
    decayedMobs: site.decayedMobs,
    nextMobTemplateId: site.nextMobTemplateId,
    nextMobName: site.nextMobName,
    nextMobPrefix: site.nextMobPrefix,
    nextMobDisplayName: site.nextMobDisplayName,
    discoveredAt: site.discoveredAt,
    currentRoom: site.currentRoom,
    totalRooms: site.totalRooms,
    roomMobCounts: site.roomMobCounts,
    currentRoomMobs: site.currentRoomMobs ?? [],
    eventModifiers: site.eventModifiers,
    totalTurnCost: site.totalTurnCost,
  }));
}

export function useEncounterSites(isAuthenticated: boolean, activeScreen: Screen, currentZoneId: string | null) {
  const [pendingEncounters, setPendingEncounters] = useState<PendingEncounter[]>([]);
  const [pendingEncountersLoading, setPendingEncountersLoading] = useState(false);
  const [pendingEncountersError, setPendingEncountersError] = useState<string | null>(null);
  const [pendingEncounterPage, setPendingEncounterPage] = useState(1);
  const [pendingEncounterZoneFilter, setPendingEncounterZoneFilter] = useState(() => currentZoneId ?? 'all');
  const [pendingEncounterMobFilter, setPendingEncounterMobFilter] = useState('all');
  const [pendingEncounterSort, setPendingEncounterSort] = useState<'recent' | 'danger'>('danger');
  const [pendingEncounterPagination, setPendingEncounterPagination] = useState({
    page: 1,
    pageSize: PENDING_ENCOUNTER_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [pendingEncounterFilters, setPendingEncounterFilters] = useState<{
    zones: Array<{ id: string; name: string }>;
    mobs: Array<{ id: string; name: string }>;
  }>({
    zones: [],
    mobs: [],
  });
  const latestPendingRequestRef = useRef(0);
  const [pendingClockMs, setPendingClockMs] = useState(() => Date.now());

  const refreshPendingEncounters = useCallback(async (options?: RefreshPendingEncounterOptions) => {
    if (!isAuthenticated) return undefined;
    const isBackground = options?.background ?? false;
    const requestId = ++latestPendingRequestRef.current;

    if (!isBackground) {
      setPendingEncountersLoading(true);
    }
    setPendingEncountersError(null);

    try {
      const query: EncounterSitesQuery = {
        page: pendingEncounterPage,
        pageSize: PENDING_ENCOUNTER_PAGE_SIZE,
        zoneId: pendingEncounterZoneFilter === 'all' ? undefined : pendingEncounterZoneFilter,
        mobFamilyId: pendingEncounterMobFilter === 'all' ? undefined : pendingEncounterMobFilter,
        sort: pendingEncounterSort,
      };

      const res = await getEncounterSites(query);

      if (latestPendingRequestRef.current !== requestId) return;

      if (!res.data) {
        setPendingEncounters([]);
        setPendingEncounterPagination({
          page: 1,
          pageSize: PENDING_ENCOUNTER_PAGE_SIZE,
          total: 0,
          totalPages: 1,
          hasNext: false,
          hasPrevious: false,
        });
        setPendingEncounterFilters({ zones: [], mobs: [] });
        setPendingEncountersError(res.error?.message ?? 'Failed to load encounter sites');
        return [];
      }

      const mappedEncounters = mapEncounterSites(res.data.encounterSites);
      let returnedEncounters = mappedEncounters;

      if (
        options?.includeEncounterSiteId &&
        !mappedEncounters.some(site => site.encounterSiteId === options.includeEncounterSiteId)
      ) {
        for (let page = 1; page <= res.data.pagination.totalPages; page++) {
          if (page === res.data.pagination.page) continue;

          const pageRes = await getEncounterSites({ ...query, page });
          if (latestPendingRequestRef.current !== requestId) return;
          if (!pageRes.data) continue;

          const activeEncounter = mapEncounterSites(pageRes.data.encounterSites)
            .find(site => site.encounterSiteId === options.includeEncounterSiteId);
          if (activeEncounter) {
            returnedEncounters = [...mappedEncounters, activeEncounter];
            break;
          }
        }
      }

      if (pendingEncounterPage > res.data.pagination.totalPages) {
        setPendingEncounterPage(res.data.pagination.totalPages);
        return returnedEncounters;
      }

      setPendingEncounters(mappedEncounters);
      setPendingEncounterPagination(res.data.pagination);
      setPendingEncounterFilters({
        zones: res.data.filters.zones,
        mobs: res.data.filters.mobFamilies,
      });
      return returnedEncounters;
    } finally {
      if (!isBackground && latestPendingRequestRef.current === requestId) {
        setPendingEncountersLoading(false);
      }
    }
  }, [isAuthenticated, pendingEncounterPage, pendingEncounterZoneFilter, pendingEncounterMobFilter, pendingEncounterSort]);

  // Poll encounter sites during active page use when on the combat screen.
  const encounterPollEnabled = isAuthenticated && activeScreen === 'combat';
  useEffect(() => {
    if (!encounterPollEnabled) return;
    setPendingClockMs(Date.now());
    void refreshPendingEncounters();
  }, [encounterPollEnabled, refreshPendingEncounters]);

  useEffect(() => {
    const nextZoneFilter = currentZoneId ?? 'all';
    setPendingEncounterZoneFilter((prev) => {
      if (prev === nextZoneFilter) return prev;
      setPendingEncounterPage(1);
      return nextZoneFilter;
    });
  }, [currentZoneId]);
  useVisibleInterval(() => {
    setPendingClockMs(Date.now());
    void refreshPendingEncounters({ background: true });
  }, 15000, encounterPollEnabled);

  const handlePendingEncounterPageChange = useCallback((page: number) => {
    setPendingEncounterPage(page);
  }, []);

  const handlePendingEncounterZoneFilterChange = useCallback((zoneId: string) => {
    setPendingEncounterZoneFilter(zoneId);
    setPendingEncounterPage(1);
  }, []);

  const handlePendingEncounterMobFilterChange = useCallback((mobTemplateId: string) => {
    setPendingEncounterMobFilter(mobTemplateId);
    setPendingEncounterPage(1);
  }, []);

  const handlePendingEncounterSortChange = useCallback((sort: 'recent' | 'danger') => {
    setPendingEncounterSort(sort);
    setPendingEncounterPage(1);
  }, []);

  return {
    pendingEncounters,
    pendingEncountersLoading,
    pendingEncountersError,
    pendingEncounterPage,
    pendingEncounterPagination,
    pendingEncounterFilters,
    pendingEncounterZoneFilter,
    pendingEncounterMobFilter,
    pendingEncounterSort,
    pendingClockMs,
    refreshPendingEncounters,
    handlePendingEncounterPageChange,
    handlePendingEncounterZoneFilterChange,
    handlePendingEncounterMobFilterChange,
    handlePendingEncounterSortChange,
  } as const;
}
