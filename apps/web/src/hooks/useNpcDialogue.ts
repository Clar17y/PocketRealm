'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DialogueEvent } from '@pocketrealm/shared';

/**
 * Manages NPC dialogue event lifecycle: greeting -> idle, with action triggers.
 * Returns the current event and a trigger function for buy/sell reactions.
 */
export function useNpcDialogue() {
  const [dialogueEvent, setDialogueEvent] = useState<DialogueEvent>('greeting');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerDialogueEvent = useCallback((event: DialogueEvent) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDialogueEvent(event);
    timerRef.current = setTimeout(() => setDialogueEvent('idle'), 4000);
  }, []);

  useEffect(() => {
    timerRef.current = setTimeout(() => setDialogueEvent('idle'), 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { dialogueEvent, triggerDialogueEvent } as const;
}
