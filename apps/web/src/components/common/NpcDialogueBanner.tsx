'use client';

import { useState, useEffect } from 'react';
import { getNpcName, NPC_DIALOGUE_CONSTANTS, type DialogueEvent, type NpcKey } from '@pocketrealm/shared';
import { getNextNpcLine } from '../../lib/npcLineRotation';
import { useSessionStorageToggle } from '../../hooks/useSessionStorageToggle';
import { ChevronRight } from 'lucide-react';

interface NpcDialogueBannerProps {
  npcKey: NpcKey;
  event: DialogueEvent;
  showDialogue?: boolean;
}

export function NpcDialogueBanner({ npcKey, event, showDialogue = true }: NpcDialogueBannerProps) {
  const name = getNpcName(npcKey);
  const [line, setLine] = useState<string | null>(null);
  const [expanded, setExpanded] = useSessionStorageToggle(`lore-collapsed:npc-banner:${npcKey}`, false);

  // Set initial line and update when event/npcKey changes
  useEffect(() => {
    setLine(getNextNpcLine(npcKey, event));
  }, [event, npcKey]);

  // Rotate idle lines on timer
  useEffect(() => {
    if (event !== 'idle') return;
    const interval = setInterval(() => {
      setLine(getNextNpcLine(npcKey, 'idle'));
    }, NPC_DIALOGUE_CONSTANTS.IDLE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [event, npcKey]);

  if (!showDialogue || !name || !line) return null;

  return (
    <div className="mb-3 p-3 rounded-lg bg-[var(--rpg-surface)] border border-[var(--rpg-border)]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 w-full text-left"
        aria-expanded={expanded}
      >
        <ChevronRight
          size={12}
          className={`text-[var(--rpg-gold)] transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-xs font-semibold text-[var(--rpg-gold)] uppercase tracking-wide">
          {name}
        </span>
        {!expanded && (
          <span className="text-xs text-[var(--rpg-text-secondary)] opacity-50 ml-1">&hellip;</span>
        )}
      </button>
      {expanded && (
        <p className="text-sm italic text-[var(--rpg-text-secondary)] leading-snug mt-1">
          &ldquo;{line}&rdquo;
        </p>
      )}
    </div>
  );
}
