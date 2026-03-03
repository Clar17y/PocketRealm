import { useCallback, useEffect, useState } from 'react';
import { getGatheringNodes, type GatheringNodesResponse } from '@/lib/api';
import type { Screen } from '../gameController.types';

const GATHERING_PAGE_SIZE = 8;

type GatheringNode = GatheringNodesResponse['nodes'][number];
type GatheringPagination = GatheringNodesResponse['pagination'];
type GatheringFilters = GatheringNodesResponse['filters'];

export function useGathering(isAuthenticated: boolean, activeScreen: Screen) {
  const [gatheringNodes, setGatheringNodes] = useState<GatheringNode[]>([]);
  const [gatheringLoading, setGatheringLoading] = useState(false);
  const [gatheringError, setGatheringError] = useState<string | null>(null);
  const [gatheringPage, setGatheringPage] = useState(1);
  const [gatheringZoneFilter, setGatheringZoneFilter] = useState('all');
  const [gatheringResourceTypeFilter, setGatheringResourceTypeFilter] = useState('all');
  const [activeGatheringSkill, setActiveGatheringSkill] = useState<'mining' | 'foraging' | 'woodcutting'>('mining');
  const [gatheringPagination, setGatheringPagination] = useState<GatheringPagination>({
    page: 1,
    pageSize: GATHERING_PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [gatheringFilters, setGatheringFilters] = useState<GatheringFilters>({
    zones: [],
    resourceTypes: [],
  });

  const loadGatheringNodes = useCallback(async () => {
    if (!isAuthenticated) return;

    setGatheringLoading(true);
    setGatheringError(null);

    const { data, error } = await getGatheringNodes({
      page: gatheringPage,
      pageSize: GATHERING_PAGE_SIZE,
      zoneId: gatheringZoneFilter === 'all' ? undefined : gatheringZoneFilter,
      resourceType: gatheringResourceTypeFilter === 'all' ? undefined : gatheringResourceTypeFilter,
      skillRequired: activeGatheringSkill,
    });

    if (data) {
      if (gatheringPage > data.pagination.totalPages) {
        setGatheringPage(data.pagination.totalPages);
        setGatheringLoading(false);
        return;
      }

      setGatheringNodes(data.nodes);
      setGatheringPagination(data.pagination);
      setGatheringFilters(data.filters);
    } else {
      setGatheringNodes([]);
      setGatheringError(error?.message ?? 'Failed to load gathering nodes');
    }

    setGatheringLoading(false);
  }, [isAuthenticated, gatheringPage, gatheringZoneFilter, gatheringResourceTypeFilter, activeGatheringSkill]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (activeScreen !== 'gathering') return;
    void loadGatheringNodes();
  }, [isAuthenticated, activeScreen, loadGatheringNodes]);

  const handleGatheringPageChange = useCallback((page: number) => {
    setGatheringPage(page);
  }, []);

  const handleGatheringZoneFilterChange = useCallback((zoneId: string) => {
    setGatheringZoneFilter(zoneId);
    setGatheringPage(1);
  }, []);

  const handleGatheringResourceTypeFilterChange = useCallback((resourceType: string) => {
    setGatheringResourceTypeFilter(resourceType);
    setGatheringPage(1);
  }, []);

  return {
    gatheringNodes,
    gatheringLoading,
    gatheringError,
    gatheringPage,
    gatheringPagination,
    gatheringFilters,
    gatheringZoneFilter,
    gatheringResourceTypeFilter,
    activeGatheringSkill,
    setActiveGatheringSkill,
    loadGatheringNodes,
    handleGatheringPageChange,
    handleGatheringZoneFilterChange,
    handleGatheringResourceTypeFilterChange,
  } as const;
}
