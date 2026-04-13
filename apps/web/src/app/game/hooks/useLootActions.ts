import { useRef, useState } from 'react';
import { claimLoot, fetchPendingLoot, type PendingLootItem } from '@/lib/api';
import { nowStamp } from './useActivityLog';
import { applyStateUpdates, type StateSetters } from '../applyStateUpdates';
import type { ActivityLogEntry } from '../gameController.types';

interface UseLootActionsParams {
  runAction: (name: string, fn: () => Promise<void>) => Promise<void>;
  pushLog: (...entries: ActivityLogEntry[]) => void;
  setActionError: (msg: string) => void;
  stateSetters: StateSetters;
  /** Created in the controller so combatPlayback can receive it before this hook runs */
  activatePendingLootRef: React.MutableRefObject<(sessionId: string) => Promise<void>>;
  pendingLootQueueRef: React.MutableRefObject<string[]>;
}

type PendingLootSessionState = {
  sessionId: string;
  sessionIds: string[];
  items: Array<PendingLootItem & { sessionId: string; itemIndex: number }>;
  minimized?: boolean;
};

export function useLootActions({
  runAction,
  pushLog,
  setActionError,
  stateSetters,
  activatePendingLootRef,
  pendingLootQueueRef,
}: UseLootActionsParams) {
  const [pendingLootSession, setPendingLootSession] = useState<PendingLootSessionState | null>(null);
  const pendingLootSessionRef = useRef<PendingLootSessionState | null>(null);

  const syncPendingLootSession = (next: PendingLootSessionState | null) => {
    pendingLootSessionRef.current = next;
    setPendingLootSession(next);
  };

  const collectQueuedSessionIds = (seedSessionIds: string[]): string[] => {
    const orderedIds = new Set<string>(seedSessionIds);

    for (const next of pendingLootQueueRef.current) {
      if (next) orderedIds.add(next);
    }

    return [...orderedIds];
  };

  const consumeQueuedSessionIds = (sessionIds: string[]) => {
    const consumed = new Set(sessionIds);
    pendingLootQueueRef.current = pendingLootQueueRef.current.filter((sessionId) => !consumed.has(sessionId));
  };

  const loadPendingLootSessions = async (sessionIds: string[]) => {
    const loadedSessions = await Promise.all(sessionIds.map(async (sessionId) => {
      const res = await fetchPendingLoot(sessionId);
      if (!res.data) {
        if (res.error?.code === 'LOOT_EXPIRED') {
          return { sessionId, items: [] };
        }
        throw new Error(res.error?.message ?? 'Failed to refresh overflow loot');
      }
      const items = res.data.items ?? [];
      return {
        sessionId,
        items: items.map((item, itemIndex) => ({
          ...item,
          sessionId,
          itemIndex,
        })),
      };
    }));

    const activeSessions = loadedSessions.filter((session) => session.items.length > 0);
    if (activeSessions.length === 0) return null;

    return {
      sessionId: activeSessions[0]!.sessionId,
      sessionIds: activeSessions.map((session) => session.sessionId),
      items: activeSessions.flatMap((session) => session.items),
      minimized: false,
    };
  };

  const activateNextQueuedLoot = async () => {
    const next = pendingLootQueueRef.current[0];
    if (next) {
      await activatePendingLootRef.current(next);
    }
  };

  const pushClaimSuccessLog = (claimedCount: number) => {
    if (claimedCount <= 0) return;
    pushLog({
      timestamp: nowStamp(),
      type: 'success',
      message: `Claimed ${claimedCount} loot items`,
    });
  };

  const clearExpiredLoot = async () => {
    syncPendingLootSession(null);
    pushLog({ timestamp: nowStamp(), type: 'warning', message: 'Overflow loot expired — unclaimed items were lost.' });
    await activateNextQueuedLoot();
  };

  const reloadPendingLootSession = async (
    sessionIds = pendingLootSessionRef.current?.sessionIds ?? [],
    options: { minimized?: boolean } = {},
  ) => {
    const mergedSessionIds = collectQueuedSessionIds(sessionIds);
    if (mergedSessionIds.length === 0) {
      syncPendingLootSession(null);
      return;
    }

    let refreshedSession;
    try {
      refreshedSession = await loadPendingLootSessions(mergedSessionIds);
    } catch (error) {
      const remainingSessionIds = new Set(sessionIds);
      setPendingLootSession((prev) => {
        if (!prev) return prev;
        if (remainingSessionIds.size === 0) return prev;

        const next = {
          ...prev,
          sessionId: remainingSessionIds.has(prev.sessionId)
            ? prev.sessionId
            : [...remainingSessionIds][0] ?? prev.sessionId,
          sessionIds: prev.sessionIds.filter((id) => remainingSessionIds.has(id)),
          items: prev.items.filter((item) => remainingSessionIds.has(item.sessionId)),
        };
        pendingLootSessionRef.current = next;
        return next;
      });
      throw error;
    }

    consumeQueuedSessionIds(mergedSessionIds);
    if (refreshedSession) {
      const nextSession = {
        ...refreshedSession,
        minimized: options.minimized ?? pendingLootSessionRef.current?.minimized ?? false,
      };
      syncPendingLootSession(nextSession);
      return;
    }

    await clearExpiredLoot();
  };

  const activatePendingLoot = async (sessionId: string) => {
    const mergedSessionIds = collectQueuedSessionIds([...(pendingLootSessionRef.current?.sessionIds ?? []), sessionId]);
    let nextSession;
    try {
      nextSession = await loadPendingLootSessions(mergedSessionIds);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to refresh overflow loot');
      return;
    }
    consumeQueuedSessionIds(mergedSessionIds);
    if (nextSession) {
      syncPendingLootSession(nextSession);
      pushLog({
        timestamp: nowStamp(),
        type: 'warning',
        message: `Backpack full! ${nextSession.items.length} item(s) waiting to be claimed.`,
      });
    } else {
      await clearExpiredLoot();
    }
  };
  activatePendingLootRef.current = activatePendingLoot;

  const handleClaimLoot = async (_sessionId: string, selectedIndices: number[]) => {
    const session = pendingLootSession;
    if (!session) return;

    await runAction('claim_loot', async () => {
      const uniqueSelectedIndices = [...new Set(selectedIndices)];
      const selectedBySession = new Map<string, number[]>();
      for (const selectedIndex of uniqueSelectedIndices) {
        const item = session.items[selectedIndex];
        if (!item) continue;
        const bucket = selectedBySession.get(item.sessionId) ?? [];
        bucket.push(item.itemIndex);
        selectedBySession.set(item.sessionId, bucket);
      }

      let hadExpiredSession = false;
      let claimedCount = 0;
      for (const [sessionIndex, groupedSessionId] of session.sessionIds.entries()) {
        const selectedForSession = selectedBySession.get(groupedSessionId) ?? [];
        const res = await claimLoot(groupedSessionId, selectedForSession);
        if (!res.data) {
          if (res.error?.code === 'LOOT_EXPIRED') {
            hadExpiredSession = true;
            continue;
          }
          try {
            await reloadPendingLootSession(session.sessionIds.slice(sessionIndex));
          } catch {
            // Keep the locally filtered retry state if the refresh itself fails.
          }
          pushClaimSuccessLog(claimedCount);
          if (hadExpiredSession) {
            pushLog({
              timestamp: nowStamp(),
              type: 'warning',
              message: 'Some overflow loot expired before it could be claimed.',
            });
          }
          setActionError(res.error?.message ?? 'Loot claim failed');
          return;
        }
        claimedCount += selectedForSession.length;
        applyStateUpdates(res.data.stateUpdates, stateSetters);
      }

      syncPendingLootSession(null);
      pushClaimSuccessLog(claimedCount);
      if (hadExpiredSession) {
        pushLog({
          timestamp: nowStamp(),
          type: 'warning',
          message: 'Some overflow loot expired before it could be claimed.',
        });
      }
      await activateNextQueuedLoot();
    });
  };

  const handleDismissLoot = () => {
    setPendingLootSession((prev) => {
      const next = prev ? { ...prev, minimized: true } : null;
      pendingLootSessionRef.current = next;
      return next;
    });
  };

  const handleReopenLoot = async () => {
    const session = pendingLootSession;
    if (!session) return;
    try {
      await reloadPendingLootSession(session.sessionIds, { minimized: false });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Failed to refresh overflow loot');
    }
  };

  return {
    pendingLootSession,
    setPendingLootSession: syncPendingLootSession,
    activatePendingLoot,
    activateNextQueuedLoot,
    reloadPendingLootSession,
    handleClaimLoot,
    handleDismissLoot,
    handleReopenLoot,
  };
}
