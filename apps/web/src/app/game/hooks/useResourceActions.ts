import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ResourceState } from '@pocketrealm/shared';
import { trackEvent } from '@/lib/analytics';
import { allocatePlayerAttribute, getHpState, rest, restEstimate } from '@/lib/api';
import { TUTORIAL_STEP_ATTRIBUTE_POINTS } from '@/lib/tutorial';
import { applyStateUpdates, type StateSetters } from '../applyStateUpdates';
import type { ActivityLogEntry, CharacterProgression, HpState } from '../gameController.types';
import { nowStamp } from './useActivityLog';

type AttributeType = keyof CharacterProgression['attributes'];
type RunAction = (name: string, fn: () => Promise<void>) => Promise<void>;

function calculateTurnsForRestoredAmount(amount: number, restoredPerTurn: number): number {
  if (amount <= 0 || restoredPerTurn <= 0) return 0;
  return Math.ceil(amount / restoredPerTurn);
}

function calculateRequestedTurnsForEffectiveTurns(effectiveTurns: number, taxRatePercent: number): number {
  if (effectiveTurns <= 0) return 0;
  if (taxRatePercent <= 0) return effectiveTurns;
  if (taxRatePercent >= 100) return Number.MAX_SAFE_INTEGER;
  return Math.ceil(effectiveTurns / (1 - taxRatePercent / 100));
}

interface UseResourceActionsParams {
  hpState: HpState;
  staminaState: Pick<ResourceState, 'current' | 'max' | 'restHealPerTurn'>;
  manaState: Pick<ResourceState, 'current' | 'max' | 'restHealPerTurn'>;
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
  staminaState,
  manaState,
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
    const hpNeedsRest = hpState.currentHp < hpState.maxHp;
    const staminaNeedsRest = staminaState.current < staminaState.max;
    const manaNeedsRest = manaState.current < manaState.max;
    if ((!hpNeedsRest && !staminaNeedsRest && !manaNeedsRest) || hpState.isRecovering || turns <= 0) return;

    await runAction('quick_rest', async () => {
      const estimate = await restEstimate(10);
      if (!estimate.data || (hpNeedsRest && !estimate.data.healPerTurn)) return;

      const targetHpHeal = (hpState.maxHp - hpState.currentHp) * (quickRestHealPercent / 100);
      const hpTurns = calculateTurnsForRestoredAmount(targetHpHeal, estimate.data.healPerTurn ?? 0);
      const staminaTurns = calculateTurnsForRestoredAmount(
        staminaState.max - staminaState.current,
        staminaState.restHealPerTurn,
      );
      const manaTurns = calculateTurnsForRestoredAmount(
        manaState.max - manaState.current,
        manaState.restHealPerTurn,
      );
      const effectiveTurnsNeeded = Math.max(hpTurns, staminaTurns, manaTurns);
      const rawTurns = calculateRequestedTurnsForEffectiveTurns(
        effectiveTurnsNeeded,
        estimate.data.taxRate ?? 0,
      );
      const turnsToSpend = Math.max(10, Math.ceil(rawTurns / 10) * 10);
      const actualTurns = Math.min(turnsToSpend, turns);
      const result = await rest(actualTurns);
      const data = result.data;
      if (data) {
        const healed = data.currentHp - hpState.currentHp;
        const turnsSpent = data.turnsSpent ?? actualTurns;
        setTurns(data.turns.currentTurns);
        setHpState(prev => ({ ...prev, currentHp: data.currentHp, maxHp: data.maxHp }));
        applyStateUpdates(data.stateUpdates, stateSetters);
        pushLog({ timestamp: nowStamp(), type: 'success', message: `Rested ${turnsSpent.toLocaleString()} turns, healed ${Math.round(healed)} HP` });
        trackEvent('action', { type: 'rest', turns: turnsSpent });
      }
    });
  }, [
    hpState,
    manaState,
    pushLog,
    quickRestHealPercent,
    runAction,
    setHpState,
    setTurns,
    staminaState,
    stateSetters,
    turns,
  ]);

  return { handleAllocateAttribute, handleQuickRest };
}
