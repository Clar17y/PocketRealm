'use client';

import { useEffect, useState } from 'react';
import { NPC_DIALOGUE_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import type { NpcKey } from '@pocketrealm/shared/constants/npcDialogue';
import { getNpcActivityReaction } from '@/lib/api';

export function useNpcActivityReaction(npcKey: NpcKey, enabled: boolean): string | null {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLine(null);
      return;
    }

    let cancelled = false;
    let clearLineTimer: ReturnType<typeof setTimeout> | undefined;
    setLine(null);
    getNpcActivityReaction(npcKey)
      .then((res) => {
        if (cancelled) return;
        const nextLine = res.data?.reaction?.line ?? null;
        setLine(nextLine);
        if (nextLine) {
          clearLineTimer = setTimeout(() => {
            if (!cancelled) {
              setLine(null);
            }
          }, NPC_DIALOGUE_CONSTANTS.ACTION_DURATION_MS);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLine(null);
      });

    return () => {
      cancelled = true;
      if (clearLineTimer) {
        clearTimeout(clearLineTimer);
      }
    };
  }, [enabled, npcKey]);

  return line;
}
