import { useCallback, useEffect, useState } from 'react';
import {
  getRouletteHistory,
  getRouletteRound,
  getRouletteStats,
  type RouletteNumberStat,
} from '@/lib/api';
import { useVisibleInterval } from '@/hooks/usePageVisible';
import type { RouletteHistoryEntry, RouletteRoundState } from '@pocketrealm/shared';

export interface UseRouletteRoundReturn {
  roundState: RouletteRoundState | null;
  history: RouletteHistoryEntry[];
  showHeatMap: boolean;
  setShowHeatMap: (next: boolean) => void;
  numberStats: RouletteNumberStat[] | null;
  refreshRound: () => Promise<void>;
}

export function useRouletteRound(): UseRouletteRoundReturn {
  const [roundState, setRoundState] = useState<RouletteRoundState | null>(null);
  const [history, setHistory] = useState<RouletteHistoryEntry[]>([]);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [numberStats, setNumberStats] = useState<RouletteNumberStat[] | null>(null);

  const refreshRound = useCallback(async () => {
    try {
      const result = await getRouletteRound();
      if (result.data) {
        setRoundState(result.data);
      }
    } catch {
      // Polling failure is non-critical; the next poll will retry.
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      const result = await getRouletteHistory();
      if (result.data) {
        setHistory(result.data.history);
      }
    } catch {
      // History fetch failure is non-critical.
    }
  }, []);

  useEffect(() => {
    void refreshRound();
    void refreshHistory();
  }, [refreshHistory, refreshRound]);

  const phase = roundState?.phase;
  const intervalMs = phase === 'result' ? 5000 : 3000;
  const shouldPoll = phase === 'betting' || phase === 'spinning' || phase === 'result';
  useVisibleInterval(() => {
    void refreshRound();
  }, intervalMs, shouldPoll);

  useEffect(() => {
    if (roundState?.phase === 'result') {
      void refreshHistory();
    }
  }, [refreshHistory, roundState?.phase]);

  useEffect(() => {
    if (!showHeatMap) {
      setNumberStats(null);
      return;
    }

    let cancelled = false;

    getRouletteStats().then((result) => {
      if (!cancelled && result.data) {
        setNumberStats(result.data.stats);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [showHeatMap]);

  return {
    roundState,
    history,
    showHeatMap,
    setShowHeatMap,
    numberStats,
    refreshRound,
  };
}
