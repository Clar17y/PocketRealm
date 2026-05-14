import { NPC_DIALOGUE, type NpcKey, type DialogueEvent } from '@pocketrealm/shared/constants/npcDialogue';
import { getTopZone } from './activityTracker';

const SHOWN_KEY_PREFIX = 'npc-lines-shown:';

interface LinePool {
  lines: string[];
  storageKeySuffix: string;
}

function getLinePool(npcKey: NpcKey, event: DialogueEvent): LinePool | null {
  const npc = NPC_DIALOGUE[npcKey];
  if (!npc) return null;

  // Check for context-aware lines first
  const topZone = getTopZone();
  if (topZone && npc.contextLines?.[event]) {
    const contextMatch = npc.contextLines[event]!.find(
      (cl) => topZone.includes(cl.zoneKeyword)
    );
    if (contextMatch && contextMatch.lines.length > 0) {
      return {
        lines: contextMatch.lines,
        storageKeySuffix: `${npcKey}:${event}:ctx:${contextMatch.zoneKeyword}`,
      };
    }
  }

  // Fall back to generic lines
  const lines = npc.lines[event];
  if (!lines || lines.length === 0) return null;

  return { lines, storageKeySuffix: `${npcKey}:${event}` };
}

function pickWithoutRepeat(pool: LinePool): string {
  const storageKey = `${SHOWN_KEY_PREFIX}${pool.storageKeySuffix}`;
  const shownJson = sessionStorage.getItem(storageKey);
  let shown: number[] = [];
  if (shownJson) {
    try { shown = JSON.parse(shownJson); } catch { /* corrupted, reset */ }
  }

  // Get indices not yet shown
  const available = pool.lines
    .map((_, i) => i)
    .filter((i) => !shown.includes(i));

  // Reset if all shown
  if (available.length === 0) {
    shown = [];
    const allIndices = pool.lines.map((_, i) => i);
    const idx = allIndices[Math.floor(Math.random() * allIndices.length)];
    sessionStorage.setItem(storageKey, JSON.stringify([idx]));
    return pool.lines[idx];
  }

  const idx = available[Math.floor(Math.random() * available.length)];
  shown.push(idx);
  sessionStorage.setItem(storageKey, JSON.stringify(shown));
  return pool.lines[idx];
}

export function getNextNpcLine(npcKey: NpcKey, event: DialogueEvent): string | null {
  const pool = getLinePool(npcKey, event);
  if (!pool) return null;
  return pickWithoutRepeat(pool);
}
