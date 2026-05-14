import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { trackEvent } from '@/lib/analytics';
import { allocatePlayerAttribute, getHpState, rest, restEstimate } from '@/lib/api';
import { TUTORIAL_STEP_ATTRIBUTE_POINTS } from '@/lib/tutorial';
import { applyStateUpdates, type StateSetters } from '../applyStateUpdates';
import type { ActivityLogEntry, CharacterProgression, HpState } from '../gameController.types';
import { nowStamp } from './useActivityLog';

type AttributeType = keyof CharacterProgression['attributes'];
type RunAction = (name: string, fn: () => Promise<void>) => Promise<void>;

interface UseResourceActionsParams {
  hpState: HpState;
  turns: number;
  quickRestHealPercent: number;
  tutorialStep: number;
  runAction: RunAction;
  pushLog: (...entries: ActivityLogEntry[]) => void;
  setTurns: (turns: number) => void;
  setActionError: (message: string) => void;
  setCharacterProgression: Dispatch<SetStateAction<CharacterProgression>>;
  setHpState: Dispatch<SetStateAction<HpState>>;
  stateSetters: StateSetters;
  advanceTutorial: (fromStep: number) => void | Promise<void>;
}

export function useResourceActions({
  hpState,
  turns,
  quickRestHealPercent,
  tutorialStep,
  runAction,
  pushLog,
  setTurns,
  setActionError,
  setCharacterProgression,
  setHpState,
  stateSetters,
  advanceTutorial,
}: UseResourceActionsParams) {
  const handleAllocateAttribute = useCallback(async (attribute: AttributeType, points = 1) => {
    await runAction('allocate_attribute', async () => {
      const res = await allocatePlayerAttribute(attribute, points);
      if (!res.data) {
        setActionError(res.error?.message ?? 'Failed to allocate attribute points');
        return;
      }

      setCharacterProgression(res.data);

      const hpRes = await getHpState();
      if (hpRes.data) setHpState(hpRes.data);

      if (tutorialStep === TUTORIAL_STEP_ATTRIBUTE_POINTS && res.data.attributePoints === 0) {
        await advanceTutorial(TUTORIAL_STEP_ATTRIBUTE_POINTS);
      }
    });
  }, [
    advanceTutorial,
    runAction,
    setActionError,
    setCharacterProgression,
    setHpState,
    tutorialStep,
  ]);

  const handleQuickRest = useCallback(async () => {
    if (hpState.currentHp >= hpState.maxHp || hpState.isRecovering || turns <= 0) return;

    await runAction('quick_rest', async () => {
      const estimate = await restEstimate(10);
      if (!estimate.data?.healPerTurn) return;
      const missingHp = hpState.maxHp - hpState.currentHp;
      const targetHeal = missingHp * (quickRestHealPercent / 100);
      const rawTurns = Math.ceil(targetHeal / estimate.data.healPerTurn);
      const turnsToSpend = Math.max(10, Math.ceil(rawTurns / 10) * 10);
      const actualTurns = Math.min(turnsToSpend, turns);
      const result = await rest(actualTurns);
      const data = result.data;
      if (data) {
        const healed = data.currentHp - hpState.currentHp;
        setTurns(data.turns.currentTurns);
        setHpState(prev => ({ ...prev, currentHp: data.currentHp, maxHp: data.maxHp }));
        applyStateUpdates(data.stateUpdates, stateSetters);
        pushLog({ timestamp: nowStamp(), type: 'success', message: `Rested ${actualTurns.toLocaleString()} turns, healed ${Math.round(healed)} HP` });
        trackEvent('action', { type: 'rest', turns: actualTurns });
      }
    });
  }, [
    hpState,
    pushLog,
    quickRestHealPercent,
    runAction,
    setHpState,
    setTurns,
    stateSetters,
    turns,
  ]);

  return { handleAllocateAttribute, handleQuickRest };
}
