'use client';

import { useState, useEffect } from 'react';
import { getNpcLine, getNpcName, type DialogueEvent, type NpcKey } from '@pocketrealm/shared';

interface NpcDialogueBannerProps {
  npcKey: NpcKey;
  event: DialogueEvent;
  idleIntervalMs?: number;
}

export function NpcDialogueBanner({ npcKey, event, idleIntervalMs = 15000 }: NpcDialogueBannerProps) {
  const name = getNpcName(npcKey);
  const [line, setLine] = useState<string | null>(() => getNpcLine(npcKey, event));

  // Update line when event or npcKey changes
  useEffect(() => {
    setLine(getNpcLine(npcKey, event));
  }, [event, npcKey]);

  // Rotate idle lines on timer
  useEffect(() => {
    if (event !== 'idle') return;
    const interval = setInterval(() => {
      setLine(getNpcLine(npcKey, 'idle'));
    }, idleIntervalMs);
    return () => clearInterval(interval);
  }, [event, npcKey, idleIntervalMs]);

  if (!name || !line) return null;

  return (
    <div className="mb-3 p-3 rounded-lg bg-[var(--rpg-surface)] border border-[var(--rpg-border)]">
      <span className="text-xs font-semibold text-[var(--rpg-gold)] uppercase tracking-wide block mb-1">
        {name}
      </span>
      <p className="text-sm italic text-[var(--rpg-text-secondary)] leading-snug">
        &ldquo;{line}&rdquo;
      </p>
    </div>
  );
}
