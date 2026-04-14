import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { TUTORIAL_STEP_COMBAT } from '@/lib/tutorial';
import type { CombatLogPrefetch } from '@/hooks/useCombatLogPrefetch';
import type { LastCombat, LastCombatLogEntry, CombatPlaybackQueueItem } from '../gameController.types';
import { buildLastCombat } from '../combatHelpers';

interface UseCombatPlaybackDeps {
  combatLogPrefetch: CombatLogPrefetch;
  setLastCombat: (lc: LastCombat | null) => void;
  setPlaybackActive: (active: boolean) => void;
  refreshPendingEncounters: () => Promise<void>;
  reloadZones: (options?: { expectedActiveZoneId?: string | null }) => Promise<void>;
  advanceTutorial: (fromStep: number) => Promise<void>;
  activeZoneIdRef: MutableRefObject<string | null>;
  /** Ref to activatePendingLoot (avoids circular definition order issues) */
  activatePendingLootRef: MutableRefObject<(sessionId: string) => Promise<void>>;
}

export function useCombatPlayback(deps: UseCombatPlaybackDeps) {
  const {
    combatLogPrefetch,
    setLastCombat,
    setPlaybackActive,
    refreshPendingEncounters,
    reloadZones,
    advanceTutorial,
    activeZoneIdRef,
    activatePendingLootRef,
  } = deps;

  const [combatPlaybackQueue, setCombatPlaybackQueue] = useState<CombatPlaybackQueueItem[] | null>(null);
  const [combatPlaybackIndex, setCombatPlaybackIndex] = useState(0);
  const [roomTransition, setRoomTransition] = useState<{ entering: number } | null>(null);

  const pendingCombatRewardsRef = useRef<LastCombat['rewards'] | null>(null);
  const siteJustClearedRef = useRef(false);
  const combatPendingLootRef = useRef<string | null>(null);

  const combatPlaybackData = combatPlaybackQueue?.[combatPlaybackIndex] ?? null;

  // Lazy-load current fight's combat log and pre-fetch next fight
  useEffect(() => {
    if (!combatPlaybackQueue) return;
    const currentFight = combatPlaybackQueue[combatPlaybackIndex];
    if (!currentFight) return;

    // Load current fight's log if not yet loaded
    if (!currentFight.log && currentFight.combatLogId) {
      void combatLogPrefetch.fetchLog(currentFight.combatLogId).then(log => {
        setCombatPlaybackQueue(prev => {
          if (!prev) return prev;
          const updated = [...prev];
          updated[combatPlaybackIndex] = { ...updated[combatPlaybackIndex], log: log as LastCombatLogEntry[] };
          return updated;
        });
      });
    }

    // Pre-fetch next fight's log
    const nextFight = combatPlaybackQueue[combatPlaybackIndex + 1];
    if (nextFight?.combatLogId) {
      combatLogPrefetch.prefetch(nextFight.combatLogId);
    }
  }, [combatPlaybackQueue, combatPlaybackIndex, combatLogPrefetch]);

  const handleCombatPlaybackComplete = async () => {
    if (combatPlaybackQueue && combatPlaybackIndex < combatPlaybackQueue.length - 1) {
      const currentFight = combatPlaybackQueue[combatPlaybackIndex];
      const nextFight = combatPlaybackQueue[combatPlaybackIndex + 1];

      // Room transition: show interstitial briefly before advancing
      if (currentFight?.room && nextFight?.room && currentFight.room !== nextFight.room) {
        setRoomTransition({ entering: nextFight.room });
        setTimeout(() => {
          setRoomTransition(null);
          setCombatPlaybackIndex(prev => prev + 1);
        }, 1500);
        return;
      }

      // More fights in the queue -- advance to next
      setCombatPlaybackIndex(combatPlaybackIndex + 1);
      return;
    }

    // All fights done -- finalize lastCombat with aggregated rewards
    const lastFight = combatPlaybackQueue?.[combatPlaybackQueue.length - 1];
    if (lastFight) {
      const aggregatedRewards = pendingCombatRewardsRef.current ?? lastFight.rewards;
      setLastCombat(buildLastCombat(combatPlaybackQueue!, aggregatedRewards));
    }
    setCombatPlaybackQueue(null);
    setCombatPlaybackIndex(0);
    setRoomTransition(null);
    pendingCombatRewardsRef.current = null;
    combatLogPrefetch.clear();
    setPlaybackActive(false);
    await refreshPendingEncounters();
    await reloadZones({ expectedActiveZoneId: activeZoneIdRef.current }).catch(() => undefined);

    if (siteJustClearedRef.current) {
      siteJustClearedRef.current = false;
      advanceTutorial(TUTORIAL_STEP_COMBAT);
    }

    const pendingId = combatPendingLootRef.current;
    combatPendingLootRef.current = null;
    if (pendingId) {
      void activatePendingLootRef.current(pendingId);
    }
  };

  return {
    combatPlaybackQueue,
    setCombatPlaybackQueue,
    combatPlaybackIndex,
    setCombatPlaybackIndex,
    roomTransition,
    setRoomTransition,
    combatPlaybackData,
    pendingCombatRewardsRef,
    siteJustClearedRef,
    combatPendingLootRef,
    handleCombatPlaybackComplete,
  };
}
