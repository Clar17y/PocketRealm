import { useCallback } from 'react';
import { trackEvent } from '@/lib/analytics';
import { mine } from '@/lib/api';
import type { QuestProgressUpdate } from '@pocketrealm/shared';
import { TUTORIAL_STEP_GATHER } from '@/lib/tutorial';
import { applyStateUpdates, type StateSetters } from '../applyStateUpdates';
import { recordTurnsSpent } from '../../../lib/activityTracker';
import type { ActivityLogEntry } from '../gameController.types';
import { nowStamp } from './useActivityLog';

type RunAction = (name: string, fn: () => Promise<void>) => Promise<void>;
type LogActiveEvents = (events: Array<{ title: string; effectType: string; effectValue: number }> | undefined) => void;

interface UseGatheringActionsParams {
  activeZoneId: string | null;
  runAction: RunAction;
  pushLog: (...entries: ActivityLogEntry[]) => void;
  setTurns: (turns: number) => void;
  setActionError: (message: string) => void;
  stateSetters: StateSetters;
  updateQuestProgress: (updates?: QuestProgressUpdate[]) => void;
  loadGatheringNodes: () => Promise<void>;
  advanceTutorial: (fromStep: number) => void | Promise<void>;
  logActiveEvents: LogActiveEvents;
}

export function useGatheringActions({
  activeZoneId,
  runAction,
  pushLog,
  setTurns,
  setActionError,
  stateSetters,
  updateQuestProgress,
  loadGatheringNodes,
  advanceTutorial,
  logActiveEvents,
}: UseGatheringActionsParams) {
  const handleMine = useCallback(async (playerNodeId: string, turnSpend: number, techniqueId?: string) => {
    if (!activeZoneId) return;

    await runAction('gathering', async () => {
      const res = await mine(playerNodeId, turnSpend, techniqueId);
      const data = res.data;
      if (!data) {
        setActionError(res.error?.message ?? 'Gathering failed');
        return;
      }

      setTurns(data.turns.currentTurns);
      updateQuestProgress(data.questProgress);
      recordTurnsSpent(activeZoneId, turnSpend);

      const newLogs: ActivityLogEntry[] = [];
      const gatheredSkillName = data.xp?.skillType
        ? data.xp.skillType.charAt(0).toUpperCase() + data.xp.skillType.slice(1)
        : 'Gathering';

      if (data.xp?.leveledUp) {
        newLogs.push({
          timestamp: nowStamp(),
          type: 'success',
          message: `${gatheredSkillName} leveled up to ${data.xp.newLevel}!`,
        });
      }

      logActiveEvents(data.activeEvents);

      if (data.yieldBreakdown?.eventTitle && data.yieldBreakdown.eventModifier !== 1) {
        const isUp = data.yieldBreakdown.eventModifier > 1;
        if (isUp) {
          const bonusPct = Math.round((data.yieldBreakdown.eventModifier - 1) * 100);
          const rawTotal = data.yieldBreakdown.rawTotalYield;
          const yieldDiff = rawTotal != null ? data.results.totalYield - rawTotal : null;
          newLogs.push({
            timestamp: nowStamp(),
            type: 'success',
            message: `${data.yieldBreakdown.eventTitle}: +${bonusPct}% yield bonus${yieldDiff != null ? ` (+${yieldDiff} items)` : ''}`,
          });
        } else {
          const turnPenaltyPct = Math.round((1 / data.yieldBreakdown.eventModifier - 1) * 100);
          newLogs.push({
            timestamp: nowStamp(),
            type: 'warning',
            message: `${data.yieldBreakdown.eventTitle}: +${turnPenaltyPct}% turn cost`,
          });
        }
      }

      if (data.gemCrit) {
        const qty = data.gemCrit.gemsFound;
        newLogs.push({
          timestamp: nowStamp(),
          type: 'success',
          message: qty === 1
            ? `Gem crit! Found a ${data.gemCrit.gemName}!`
            : `Gem crits! Found ${qty}x ${data.gemCrit.gemName}!`,
        });
      }

      if (data.node.nodeDepleted) {
        newLogs.push({
          timestamp: nowStamp(),
          type: 'info',
          message: `Node depleted! Gathered ${data.results.totalYield} resource(s).`,
        });
      } else {
        newLogs.push({
          timestamp: nowStamp(),
          type: 'success',
          message: `Gathered ${data.results.totalYield} resource(s). ${data.node.remainingCapacity} remaining.`,
        });
      }

      pushLog(...newLogs);
      applyStateUpdates(data.stateUpdates, stateSetters);
      const gatherType = data.xp?.skillType ?? 'mining';
      trackEvent('action', { type: gatherType, turns: turnSpend, zone: activeZoneId });
      if (data.xp?.leveledUp) {
        trackEvent('level_up', { skill: data.xp.skillType, level: data.xp.newLevel });
      }
      await loadGatheringNodes();
      await advanceTutorial(TUTORIAL_STEP_GATHER);
    });
  }, [
    activeZoneId,
    advanceTutorial,
    loadGatheringNodes,
    logActiveEvents,
    pushLog,
    runAction,
    setActionError,
    setTurns,
    stateSetters,
    updateQuestProgress,
  ]);

  return { handleMine };
}
