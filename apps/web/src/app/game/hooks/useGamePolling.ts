import { useCallback, type MutableRefObject } from 'react';
import { getHpState, getResources, getTurns } from '@/lib/api';
import type { ResourceState } from '@pocketrealm/shared';
import type { HpState } from '../gameController.types';

export const SCREEN_POLL_NEEDS: Record<string, Array<'turns' | 'hp' | 'resources'>> = {
  explore: ['turns', 'hp', 'resources'],
  combat: ['turns', 'hp', 'resources'],
  rest: ['turns', 'hp', 'resources'],
  home: ['turns', 'hp', 'resources'],
  arena: ['turns', 'hp', 'resources'],
  travel: ['turns', 'hp', 'resources'],
  gathering: ['turns'],
  crafting: ['turns'],
  forge: ['turns'],
  casino: ['turns'],
  skills: ['turns'],
  zones: ['turns'],
  bestiary: ['turns'],
  training: ['turns'],
};

interface UseGamePollingOptions {
  activeScreenRef: MutableRefObject<string>;
  hpStateRef: MutableRefObject<Pick<HpState, 'currentHp' | 'maxHp'>>;
  staminaStateRef: MutableRefObject<Pick<ResourceState, 'current' | 'max'>>;
  manaStateRef: MutableRefObject<Pick<ResourceState, 'current' | 'max'>>;
  setTurns: (turns: number) => void;
  setHpState: (state: HpState) => void;
  setStaminaState: (state: ResourceState) => void;
  setManaState: (state: ResourceState) => void;
}

export function useGamePolling({
  activeScreenRef,
  hpStateRef,
  staminaStateRef,
  manaStateRef,
  setTurns,
  setHpState,
  setStaminaState,
  setManaState,
}: UseGamePollingOptions) {
  return useCallback(async () => {
    const needs = SCREEN_POLL_NEEDS[activeScreenRef.current] ?? ['turns'];
    const fetches: Promise<void>[] = [];

    fetches.push(getTurns().then((response) => {
      if (response.data) {
        setTurns(response.data.currentTurns);
        window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: true } }));
      } else {
        window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok: false } }));
        window.dispatchEvent(new CustomEvent('api:error', {
          detail: {
            message: response.error?.message ?? 'Network error',
            code: response.error?.code ?? 'UNKNOWN',
          },
        }));
      }
    }));

    if (needs.includes('hp') && hpStateRef.current.currentHp < hpStateRef.current.maxHp) {
      fetches.push(getHpState().then((response) => {
        if (response.data) {
          setHpState(response.data);
          hpStateRef.current = response.data;
        }
      }));
    }

    if (needs.includes('resources')) {
      const staminaFull = staminaStateRef.current.current >= staminaStateRef.current.max;
      const manaFull = manaStateRef.current.current >= manaStateRef.current.max;
      if (!staminaFull || !manaFull) {
        fetches.push(getResources().then((response) => {
          if (response.data) {
            setStaminaState(response.data.stamina);
            setManaState(response.data.mana);
          }
        }));
      }
    }

    await Promise.all(fetches);
  }, [activeScreenRef, hpStateRef, manaStateRef, setHpState, setManaState, setStaminaState, setTurns, staminaStateRef]);
}
