'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { NPC_DIALOGUE_CONSTANTS, type DialogueEvent } from '@pocketrealm/shared';

const {
  GREETING_DURATION_MS,
  ACTION_DURATION_MS,
  FAREWELL_DELAY_MS,
} = NPC_DIALOGUE_CONSTANTS;

/**
 * Manages NPC dialogue event lifecycle:
 *   greeting (10s) -> idle (rotating) -> farewell (after 30s total)
 * Action triggers (buy/sell) briefly interrupt idle before returning.
 */
export function useNpcDialogue() {
  const [dialogueEvent, setDialogueEvent] = useState<DialogueEvent>('greeting');
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const farewellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDialogueEvent = useCallback((event: DialogueEvent) => {
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    setDialogueEvent(event);
    actionTimerRef.current = setTimeout(() => setDialogueEvent('idle'), ACTION_DURATION_MS);
  }, []);

  // Greeting -> idle transition
  useEffect(() => {
    actionTimerRef.current = setTimeout(() => setDialogueEvent('idle'), GREETING_DURATION_MS);
    return () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    };
  }, []);

  // Farewell after extended time on page
  useEffect(() => {
    farewellTimerRef.current = setTimeout(() => setDialogueEvent('farewell'), FAREWELL_DELAY_MS);
    return () => {
      if (farewellTimerRef.current) clearTimeout(farewellTimerRef.current);
    };
  }, []);

  return { dialogueEvent, triggerDialogueEvent } as const;
}
