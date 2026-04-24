import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRouletteHistory,
  getRouletteRound,
  getRouletteStats,
  type RouletteNumberStat,
} from '@/lib/api';
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    const phase = roundState?.phase;
    const intervalMs = phase === 'result' ? 5000 : 3000;
    const shouldPoll = phase === 'betting' || phase === 'spinning' || phase === 'result';

    if (shouldPoll) {
      pollRef.current = setInterval(() => {
        void refreshRound();
      }, intervalMs);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [refreshRound, roundState?.phase]);

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
