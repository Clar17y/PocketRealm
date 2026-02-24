import { useRef, useCallback } from 'react';
import { getCombatLog } from '@/lib/api/combat';
import type { CombatLogEntryResponse } from '@/lib/api/combat';

export function useCombatLogPrefetch() {
  const cacheRef = useRef<Map<string, CombatLogEntryResponse[]>>(new Map());
  const inflightRef = useRef<Map<string, Promise<CombatLogEntryResponse[]>>>(new Map());

  const fetchLog = useCallback(async (combatLogId: string): Promise<CombatLogEntryResponse[]> => {
    const cached = cacheRef.current.get(combatLogId);
    if (cached) return cached;

    const inflight = inflightRef.current.get(combatLogId);
    if (inflight) return inflight;

    const promise = getCombatLog(combatLogId).then(res => {
      const combat = res.data?.combat as Record<string, unknown> | undefined;
      const log = (combat?.log as CombatLogEntryResponse[] | undefined) ?? [];
      cacheRef.current.set(combatLogId, log);
      inflightRef.current.delete(combatLogId);
      return log;
    });

    inflightRef.current.set(combatLogId, promise);
    return promise;
  }, []);

  const prefetch = useCallback((combatLogId: string) => {
    void fetchLog(combatLogId);
  }, [fetchLog]);

  const getLog = useCallback((combatLogId: string): CombatLogEntryResponse[] | null => {
    return cacheRef.current.get(combatLogId) ?? null;
  }, []);

  const clear = useCallback(() => {
    cacheRef.current.clear();
    inflightRef.current.clear();
  }, []);

  return { fetchLog, prefetch, getLog, clear };
}
