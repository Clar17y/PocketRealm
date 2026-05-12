'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { NPC_DIALOGUE_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import type { DialogueEvent } from '@pocketrealm/shared/constants/npcDialogue';

const {
  GREETING_DURATION_MS,
  ACTION_DURATION_MS,
  FAREWELL_DELAY_MS,
} = NPC_DIALOGUE_CONSTANTS;

/**
 * Manages NPC dialogue event lifecycle:
 *   greeting (10s) -> idle (rotating) -> farewell (after 60s total)
 * Action triggers (buy/sell) briefly interrupt idle before returning.
 *
 * Pass a `resetKey` (e.g., the npcKey) to restart the greeting cycle
 * when the NPC changes without the component remounting.
 */
export function useNpcDialogue(resetKey?: string) {
  const [dialogueEvent, setDialogueEvent] = useState<DialogueEvent>('greeting');
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const farewellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDialogueEvent = useCallback((event: DialogueEvent) => {
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    setDialogueEvent(event);
    actionTimerRef.current = setTimeout(() => setDialogueEvent('idle'), ACTION_DURATION_MS);
  }, []);

  // Greeting -> idle transition (restarts when resetKey changes)
  useEffect(() => {
    setDialogueEvent('greeting');
    actionTimerRef.current = setTimeout(() => setDialogueEvent('idle'), GREETING_DURATION_MS);
    return () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    };
  }, [resetKey]);

  // Farewell after extended time (restarts when resetKey changes)
  useEffect(() => {
    farewellTimerRef.current = setTimeout(() => setDialogueEvent('farewell'), FAREWELL_DELAY_MS);
    return () => {
      if (farewellTimerRef.current) clearTimeout(farewellTimerRef.current);
    };
  }, [resetKey]);

  return { dialogueEvent, triggerDialogueEvent } as const;
}
