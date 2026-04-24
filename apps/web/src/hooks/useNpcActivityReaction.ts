'use client';

import { useEffect, useState } from 'react';
import type { NpcKey } from '@pocketrealm/shared';
import { getNpcActivityReaction } from '@/lib/api';

export function useNpcActivityReaction(npcKey: NpcKey, enabled: boolean): string | null {
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLine(null);
      return;
    }

    let cancelled = false;
    getNpcActivityReaction(npcKey).then((res) => {
      if (cancelled) return;
      setLine(res.data?.reaction?.line ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, npcKey]);

  return line;
}
