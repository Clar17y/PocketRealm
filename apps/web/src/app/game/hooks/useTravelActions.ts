import { useState, useRef } from 'react';
import { travelToZone, claimLoot } from '@/lib/api';
import type { StateUpdates } from '@pocketrealm/shared';
import { TUTORIAL_STEP_TRAVEL } from '@/lib/tutorial';
import { nowStamp } from './useActivityLog';
import { mapPlaybackEventsToLogs } from '../gameControllerHelpers';
import { applyStateUpdates, type StateSetters } from '../applyStateUpdates';
import { findShortestZonePath } from '@/lib/zoneRoutes';
import type { ActivityLogEntry, HpState } from '../gameController.types';

interface TravelPlaybackState {
  totalTurns: number;
  destinationName: string;
  events: Array<{ turn: number; type: string; description: string; details?: Record<string, unknown> }>;
  aborted: boolean;
  refundedTurns: number;
  playerHpBefore: number;
  playerMaxHp: number;
  respawnedToName?: string;
  currentHop: number;
  totalHops: number;
  finalDestinationName: string;
  stateUpdates?: StateUpdates;
}

interface TravelRouteState {
  remainingZoneIds: string[];
  totalHops: number;
  finalDestinationName: string;
}

interface UseTravelActionsParams {
  hpStateRef: React.MutableRefObject<HpState>;
  activeZoneId: string | null;
  zones: Array<{ id: string; name: string; zoneType: string; [key: string]: unknown }>;
  zoneConnections: Array<{ fromId: string; toId: string; explorationThreshold: number }>;
  runAction: (name: string, fn: () => Promise<void>) => Promise<void>;
  pushLog: (...entries: ActivityLogEntry[]) => void;
  setTurns: (n: number) => void;
  setActiveZoneId: (id: string | null) => void;
  setActionError: (msg: string) => void;
  setPlaybackActive: (active: boolean) => void;
  stateSetters: StateSetters;
  advanceTutorial: (fromStep: number) => void | Promise<void>;
  refreshCraftingRecipes: () => Promise<void>;
  loadAll: () => Promise<void>;
  pendingLootSession: { sessionId: string; sessionIds: string[] } | null;
  clearPendingLootSession: () => void;
  reloadPendingLootSession: (sessionIds?: string[]) => Promise<void>;
  pendingLootQueueRef: React.MutableRefObject<string[]>;
  activateNextQueuedLoot: () => Promise<void>;
  logDurabilityWarnings: (losses: Array<{
    itemName?: string; newDurability?: number; maxDurability?: number;
    isBroken?: boolean; crossedWarningThreshold?: boolean;
  }>) => void;
}

export function useTravelActions({
  hpStateRef,
  activeZoneId,
  zones,
  zoneConnections,
  runAction,
  pushLog,
  setTurns,
  setActiveZoneId,
  setActionError,
  setPlaybackActive,
  stateSetters,
  advanceTutorial,
  refreshCraftingRecipes,
  loadAll,
  pendingLootSession,
  clearPendingLootSession,
  reloadPendingLootSession,
  pendingLootQueueRef,
  activateNextQueuedLoot,
  logDurabilityWarnings,
}: UseTravelActionsParams) {
  const [travelPlaybackData, setTravelPlaybackData] = useState<TravelPlaybackState | null>(null);
  const [confirmAbandonLoot, setConfirmAbandonLoot] = useState<{ travelZoneId: string } | null>(null);
  const travelRouteRef = useRef<TravelRouteState | null>(null);
  const arrivedInTownRef = useRef(false);
  const pendingLootSessionRef = useRef(pendingLootSession);
  pendingLootSessionRef.current = pendingLootSession;

  const completeQueuedTravelRoute = async () => {
    travelRouteRef.current = null;
    setPlaybackActive(false);
    void refreshCraftingRecipes();

    if (arrivedInTownRef.current) {
      arrivedInTownRef.current = false;
      advanceTutorial(TUTORIAL_STEP_TRAVEL);
    }

    if (!pendingLootSessionRef.current && pendingLootQueueRef.current.length > 0) {
      await activateNextQueuedLoot();
    }
  };

  const executeNextTravelHop = async () => {
    const route = travelRouteRef.current;
    if (!route || route.remainingZoneIds.length === 0) {
      await completeQueuedTravelRoute();
      return;
    }

    const nextZoneId = route.remainingZoneIds[0]!;
    const currentHop = route.totalHops - route.remainingZoneIds.length + 1;
    const hpBefore = hpStateRef.current.currentHp;
    const playerMaxHp = hpStateRef.current.maxHp;

    const res = await travelToZone(nextZoneId);
    const data = res.data;
    if (!data) {
      travelRouteRef.current = null;
      setPlaybackActive(false);
      setActionError(res.error?.message ?? 'Travel failed');
      await loadAll();
      if (pendingLootQueueRef.current.length > 0) {
        await activateNextQueuedLoot();
      }
      return;
    }

    setTurns(data.turns.currentTurns);
    route.remainingZoneIds.shift();

    const arrivedInTown = data.zone.zoneType === 'town';
    if (arrivedInTown) arrivedInTownRef.current = true;

    if (data.pendingLootSessionId) {
      pendingLootQueueRef.current.push(data.pendingLootSessionId);
    }

    if (data.breadcrumbReturn) {
      setActiveZoneId(data.zone.id);
      pushLog({ timestamp: nowStamp(), type: 'success', message: `Returned to ${data.zone.name}.` });

      if (route.remainingZoneIds.length > 0) {
        applyStateUpdates(data.stateUpdates, stateSetters);
        await executeNextTravelHop();
        return;
      }

      applyStateUpdates(data.stateUpdates, stateSetters);
      await completeQueuedTravelRoute();
      return;
    }

    const travelCost = data.travelCost ?? 0;
    if (travelCost > 0) {
      const hopSuffix = route.totalHops > 1
        ? ` (${currentHop}/${route.totalHops} to ${route.finalDestinationName})`
        : '';
      pushLog({
        timestamp: nowStamp(),
        type: 'info',
        message: `Travelling to ${data.zone.name}${hopSuffix}...`,
      });

      setTravelPlaybackData({
        totalTurns: travelCost,
        destinationName: data.zone.name,
        events: data.events,
        aborted: data.aborted,
        refundedTurns: data.refundedTurns,
        playerHpBefore: hpBefore,
        playerMaxHp,
        respawnedToName: data.respawnedTo?.townName,
        currentHop,
        totalHops: route.totalHops,
        finalDestinationName: route.finalDestinationName,
        stateUpdates: data.stateUpdates,
      });
      setPlaybackActive(true);
      return;
    }

    setActiveZoneId(data.zone.id);
    pushLog({ timestamp: nowStamp(), type: 'success', message: `Arrived at ${data.zone.name}.` });

    if (route.remainingZoneIds.length > 0) {
      applyStateUpdates(data.stateUpdates, stateSetters);
      await executeNextTravelHop();
      return;
    }

    applyStateUpdates(data.stateUpdates, stateSetters);
    await completeQueuedTravelRoute();
  };

  const finalizeTravelPlayback = async () => {
    const currentPlayback = travelPlaybackData;
    if (!currentPlayback) return;

    const shouldContinueRoute =
      !currentPlayback.aborted &&
      (travelRouteRef.current?.remainingZoneIds.length ?? 0) > 0;

    const savedStateUpdates = currentPlayback.stateUpdates;
    setTravelPlaybackData(null);
    setPlaybackActive(false);

    if (currentPlayback.aborted) {
      travelRouteRef.current = null;
    }

    if (shouldContinueRoute) {
      applyStateUpdates(savedStateUpdates, stateSetters);
      await executeNextTravelHop();
      return;
    }

    applyStateUpdates(savedStateUpdates, stateSetters);
    await completeQueuedTravelRoute();
  };

  const beginTravelToZone = async (
    id: string,
    options: { ignorePendingLoot?: boolean } = {},
  ) => {
    if (pendingLootSessionRef.current && !options.ignorePendingLoot) {
      setConfirmAbandonLoot({ travelZoneId: id });
      return;
    }

    if (!activeZoneId) return;
    if (id === activeZoneId) return;

    const route = findShortestZonePath(activeZoneId, id, zoneConnections);
    if (!route) {
      setActionError('No route to that zone');
      return;
    }

    const hops = route.slice(1);
    if (hops.length === 0) return;

    const finalDestinationName = zones.find((zone) => zone.id === id)?.name ?? 'that zone';
    travelRouteRef.current = {
      remainingZoneIds: hops,
      totalHops: hops.length,
      finalDestinationName,
    };

    await runAction('travel', async () => {
      await executeNextTravelHop();
    });
  };

  const handleTravelToZone = async (id: string) => {
    await beginTravelToZone(id);
  };

  const handleTravelPlaybackComplete = async () => {
    if (travelPlaybackData) {
      if (travelPlaybackData.aborted && travelPlaybackData.respawnedToName) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `You were knocked out and woke up in ${travelPlaybackData.respawnedToName}.`,
        });
      } else if (travelPlaybackData.aborted) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `Travel to ${travelPlaybackData.destinationName} failed. You fled back to safety.`,
        });
      } else {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Arrived at ${travelPlaybackData.destinationName}.`,
        });
      }
      for (const event of travelPlaybackData.events) {
        const losses = event.details?.durabilityLost;
        if (Array.isArray(losses)) logDurabilityWarnings(losses);
      }
    }
    await finalizeTravelPlayback();
  };

  const handleTravelPlaybackSkip = async () => {
    if (travelPlaybackData) {
      pushLog(...mapPlaybackEventsToLogs(travelPlaybackData.events));

      if (travelPlaybackData.aborted && travelPlaybackData.respawnedToName) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `You were knocked out and woke up in ${travelPlaybackData.respawnedToName}.`,
        });
      } else if (travelPlaybackData.aborted) {
        pushLog({
          timestamp: nowStamp(),
          type: 'danger',
          message: `Travel to ${travelPlaybackData.destinationName} failed. You fled back to safety.`,
        });
      } else {
        pushLog({
          timestamp: nowStamp(),
          type: 'success',
          message: `Arrived at ${travelPlaybackData.destinationName}.`,
        });
      }
    }
    await finalizeTravelPlayback();
  };

  const abandonLootAndTravel = async () => {
    if (!confirmAbandonLoot) return;
    const zoneId = confirmAbandonLoot.travelZoneId;
    const currentPendingLootSession = pendingLootSessionRef.current;
    if (currentPendingLootSession) {
      for (const [sessionIndex, sessionId] of currentPendingLootSession.sessionIds.entries()) {
        const res = await claimLoot(sessionId, []);
        if (!res.data && res.error?.code !== 'LOOT_EXPIRED') {
          setConfirmAbandonLoot(null);
          try {
            await reloadPendingLootSession(currentPendingLootSession.sessionIds.slice(sessionIndex));
          } catch {
            // Keep the locally preserved retry state and surface the original discard error.
          }
          setActionError(res.error?.message ?? 'Discarding overflow loot failed');
          return;
        }
      }
      pendingLootSessionRef.current = null;
      clearPendingLootSession();
    }
    pendingLootQueueRef.current = [];
    setConfirmAbandonLoot(null);
    await beginTravelToZone(zoneId, { ignorePendingLoot: true });
  };

  return {
    travelPlaybackData,
    confirmAbandonLoot,
    cancelAbandonLoot: () => setConfirmAbandonLoot(null),
    handleTravelToZone,
    handleTravelPlaybackComplete,
    handleTravelPlaybackSkip,
    abandonLootAndTravel,
  };
}
