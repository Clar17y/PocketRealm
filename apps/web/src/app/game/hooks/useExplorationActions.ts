import { useState } from 'react';
import { trackEvent } from '@/lib/analytics';
import { startExploration } from '@/lib/api';
import type { StateUpdates } from '@pocketrealm/shared';
import { TUTORIAL_STEP_EXPLORE } from '@/lib/tutorial';
import { nowStamp } from './useActivityLog';
import { mapPlaybackEventsToLogs, showQuestToasts } from '../gameControllerHelpers';
import { applyStateUpdates, type StateSetters } from '../applyStateUpdates';
import { recordTurnsSpent } from '../../../lib/activityTracker';
import { fmtDur } from '@/lib/format';
import type { ActivityLogEntry, HpState } from '../gameController.types';

interface ExplorationPlaybackData {
  totalTurns: number;
  zoneName: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBeforeExploration: number;
  playerMaxHp: number;
  pendingLootSessionIds?: string[];
  stateUpdates?: StateUpdates;
}

interface UseExplorationActionsParams {
  hpStateRef: React.MutableRefObject<HpState>;
  currentZone: { id: string; name: string } | null;
  runAction: (name: string, fn: () => Promise<void>) => Promise<void>;
  pushLog: (...entries: ActivityLogEntry[]) => void;
  setTurns: (n: number) => void;
  setActionError: (msg: string) => void;
  setPlaybackActive: (active: boolean) => void;
  stateSetters: StateSetters;
  advanceTutorial: (fromStep: number) => void | Promise<void>;
  combatLogPrefetchClear: () => void;
  refreshPendingEncounters: () => Promise<void>;
  loadGatheringNodes: () => Promise<void>;
  pendingLootQueueRef: React.MutableRefObject<string[]>;
  activatePendingLoot: (sessionId: string) => Promise<void>;
  updateZoneExploration: (zoneId: string, exploration: { turnsExplored: number; percent: number; turnsToExplore: number | null }) => void;
}

export function useExplorationActions({
  hpStateRef,
  currentZone,
  runAction,
  pushLog,
  setTurns,
  setActionError,
  setPlaybackActive,
  stateSetters,
  advanceTutorial,
  combatLogPrefetchClear,
  refreshPendingEncounters,
  loadGatheringNodes,
  pendingLootQueueRef,
  activatePendingLoot,
  updateZoneExploration,
}: UseExplorationActionsParams) {
  const [explorationPlaybackData, setExplorationPlaybackData] = useState<ExplorationPlaybackData | null>(null);

  const logDurabilityWarnings = (
    losses: Array<{
      itemName?: string;
      newDurability?: number;
      maxDurability?: number;
      isBroken?: boolean;
      crossedWarningThreshold?: boolean;
    }>,
  ) => {
    const entries: ActivityLogEntry[] = [];
    for (const loss of losses) {
      if (!loss.itemName) continue;
      if (loss.isBroken) {
        entries.push({
          timestamp: nowStamp(),
          type: 'danger',
          message: `Your ${loss.itemName} has broken!`,
        });
      } else if (loss.crossedWarningThreshold) {
        entries.push({
          timestamp: nowStamp(),
          type: 'warning',
          message: `Your ${loss.itemName} is about to break! (${fmtDur(loss.newDurability!)}/${loss.maxDurability})`,
        });
      }
    }
    if (entries.length > 0) pushLog(...entries);
  };

  const finalizeExplorationPlayback = async () => {
    const pendingIds = explorationPlaybackData?.pendingLootSessionIds;
    const savedStateUpdates = explorationPlaybackData?.stateUpdates;

    if (explorationPlaybackData) {
      trackEvent('action', {
        type: 'exploration',
        turns: explorationPlaybackData.totalTurns,
        zone: explorationPlaybackData.zoneName,
      });
    }

    setExplorationPlaybackData(null);
    combatLogPrefetchClear();
    setPlaybackActive(false);
    await advanceTutorial(TUTORIAL_STEP_EXPLORE);
    applyStateUpdates(savedStateUpdates, stateSetters);
    if (pendingIds?.length) {
      pendingLootQueueRef.current = pendingIds.slice(1);
      await activatePendingLoot(pendingIds[0]);
    }
  };

  const handleStartExploration = async (turnSpend: number, tier?: number) => {
    if (!currentZone) return;

    await runAction('exploration', async () => {
      const hpBefore = hpStateRef.current.currentHp;
      const maxHpBefore = hpStateRef.current.maxHp;
      const res = await startExploration(currentZone.id, turnSpend, tier);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Exploration failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      showQuestToasts(data.questProgress);
      recordTurnsSpent(currentZone.id, turnSpend);
      updateZoneExploration(currentZone.id, data.explorationProgress);

      setExplorationPlaybackData({
        totalTurns: turnSpend,
        zoneName: data.zone.name,
        events: data.events,
        aborted: data.aborted,
        refundedTurns: data.refundedTurns,
        playerHpBeforeExploration: hpBefore,
        playerMaxHp: maxHpBefore,
        pendingLootSessionIds: data.pendingLootSessionIds,
        stateUpdates: data.stateUpdates,
      });
      setPlaybackActive(true);

      if (data.encounterSites.length > 0) {
        await refreshPendingEncounters();
      }
      if (data.resourceDiscoveries.length > 0) {
        await loadGatheringNodes();
      }
    });
  };

  const handleExplorationPlaybackComplete = async () => {
    if (explorationPlaybackData) {
      pushLog({
        timestamp: nowStamp(),
        type: 'info',
        message: `Explored ${explorationPlaybackData.totalTurns.toLocaleString()} turns in ${explorationPlaybackData.zoneName}.`,
      });
      if (explorationPlaybackData.aborted && explorationPlaybackData.refundedTurns > 0) {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Exploration aborted. ${explorationPlaybackData.refundedTurns.toLocaleString()} turns refunded.`,
        });
      }
      for (const event of explorationPlaybackData.events) {
        const losses = event.details?.durabilityLost;
        if (Array.isArray(losses)) logDurabilityWarnings(losses);
      }
    }
    await finalizeExplorationPlayback();
  };

  const handlePlaybackSkip = async () => {
    if (explorationPlaybackData) {
      pushLog(
        {
          timestamp: nowStamp(),
          type: 'info',
          message: `Explored ${explorationPlaybackData.totalTurns.toLocaleString()} turns in ${explorationPlaybackData.zoneName}.`,
        },
        ...mapPlaybackEventsToLogs(explorationPlaybackData.events),
      );
      if (explorationPlaybackData.aborted && explorationPlaybackData.refundedTurns > 0) {
        pushLog({
          timestamp: nowStamp(),
          type: 'info',
          message: `Exploration aborted. ${explorationPlaybackData.refundedTurns.toLocaleString()} turns refunded.`,
        });
      }
    }
    await finalizeExplorationPlayback();
  };

  return {
    explorationPlaybackData,
    handleStartExploration,
    handleExplorationPlaybackComplete,
    handlePlaybackSkip,
    logDurabilityWarnings,
  };
}
