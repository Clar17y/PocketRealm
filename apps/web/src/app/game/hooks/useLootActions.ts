import { useState } from 'react';
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

export function useLootActions({
  runAction,
  pushLog,
  setActionError,
  stateSetters,
  activatePendingLootRef,
  pendingLootQueueRef,
}: UseLootActionsParams) {
  const [pendingLootSession, setPendingLootSession] = useState<{
    sessionId: string;
    items: PendingLootItem[];
    minimized?: boolean;
  } | null>(null);

  const activateNextQueuedLoot = async () => {
    const next = pendingLootQueueRef.current.shift();
    if (next) {
      await activatePendingLootRef.current(next);
    }
  };

  const clearExpiredLoot = async () => {
    setPendingLootSession(null);
    pushLog({ timestamp: nowStamp(), type: 'warning', message: 'Overflow loot expired — unclaimed items were lost.' });
    await activateNextQueuedLoot();
  };

  const activatePendingLoot = async (sessionId: string) => {
    const res = await fetchPendingLoot(sessionId);
    if (res.data?.items?.length) {
      setPendingLootSession({ sessionId, items: res.data.items, minimized: false });
      pushLog({
        timestamp: nowStamp(),
        type: 'warning',
        message: `Backpack full! ${res.data.items.length} item(s) waiting to be claimed.`,
      });
    } else {
      await clearExpiredLoot();
    }
  };
  activatePendingLootRef.current = activatePendingLoot;

  const handleClaimLoot = async (sessionId: string, selectedIndices: number[]) => {
    await runAction('claim_loot', async () => {
      const res = await claimLoot(sessionId, selectedIndices);
      if (!res.data) {
        if (res.error?.code === 'LOOT_EXPIRED') {
          await clearExpiredLoot();
        } else {
          setPendingLootSession(null);
          setActionError(res.error?.message ?? 'Loot claim failed');
        }
        return;
      }
      setPendingLootSession(null);
      pushLog({
        timestamp: nowStamp(),
        type: 'success',
        message: `Claimed ${selectedIndices.length} loot items`,
      });
      applyStateUpdates(res.data.stateUpdates, stateSetters);
      await activateNextQueuedLoot();
    });
  };

  const handleDismissLoot = () => {
    setPendingLootSession((prev) => prev ? { ...prev, minimized: true } : null);
  };

  const handleReopenLoot = async () => {
    const session = pendingLootSession;
    if (!session) return;
    const res = await fetchPendingLoot(session.sessionId);
    if (res.data?.items?.length) {
      setPendingLootSession({ sessionId: session.sessionId, items: res.data.items, minimized: false });
    } else {
      await clearExpiredLoot();
    }
  };

  return {
    pendingLootSession,
    setPendingLootSession,
    activatePendingLoot,
    activateNextQueuedLoot,
    handleClaimLoot,
    handleDismissLoot,
    handleReopenLoot,
  };
}
