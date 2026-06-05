'use client';

import { useEffect, useState } from 'react';
import { NPC_DIALOGUE_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';
import type { NpcKey } from '@pocketrealm/shared/constants/npcDialogue';
import { getNpcActivityReaction } from '@/lib/api';

const reactionCache = new Map<NpcKey, { line: string | null; expiresAt: number }>();
const reactionInFlight = new Map<NpcKey, Promise<string | null>>();

function getCachedReactionLine(npcKey: NpcKey): string | null | undefined {
  const cached = reactionCache.get(npcKey);
  if (!cached) return undefined;
  if (cached.expiresAt <= Date.now()) {
    reactionCache.delete(npcKey);
    return undefined;
  }
  return cached.line;
}

async function loadReactionLine(npcKey: NpcKey): Promise<string | null> {
  const cachedLine = getCachedReactionLine(npcKey);
  if (cachedLine !== undefined) return cachedLine;

  const inFlight = reactionInFlight.get(npcKey);
  if (inFlight) return inFlight;

  const promise = getNpcActivityReaction(npcKey)
    .then((res) => {
      const line = res.data?.reaction?.line ?? null;
      reactionCache.set(npcKey, {
        line,
        expiresAt: Date.now() + NPC_DIALOGUE_CONSTANTS.ACTION_DURATION_MS,
      });
      return line;
    })
    .finally(() => {
      reactionInFlight.delete(npcKey);
    });

  reactionInFlight.set(npcKey, promise);
  return promise;
}

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
    loadReactionLine(npcKey)
      .then((res) => {
        if (cancelled) return;
        setLine(res);
        if (res) {
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
