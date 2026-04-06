import type { QuestProgressUpdate } from '@pocketrealm/shared';
import type { ForgeResultData } from '@/components/ForgeResultToast';
import { nowStamp } from './hooks/useActivityLog';

export function mapPlaybackEventsToLogs(
  events: Array<{ turn: number; type: string; description: string }>,
): Array<{ timestamp: string; type: 'info' | 'success' | 'danger'; message: string }> {
  return events.slice().reverse().map((event) => ({
    timestamp: nowStamp(),
    type: (event.type === 'ambush_defeat'
      ? 'danger'
      : event.type === 'ambush_victory' || event.type === 'encounter_site' || event.type === 'resource_node'
        ? 'success'
        : 'info') as 'info' | 'success' | 'danger',
    message: `Turn ${event.turn}: ${event.description}`,
  }));
}

export function showQuestToasts(updates?: QuestProgressUpdate[]) {
  if (!updates?.length) return;
  const show = (window as unknown as Record<string, unknown>).__showQuestToast as
    | ((update: QuestProgressUpdate) => void)
    | undefined;
  if (!show) return;
  for (const update of updates) show(update);
}

export function showForgeToast(data: ForgeResultData) {
  const show = (window as unknown as Record<string, unknown>).__showForgeToast as
    | ((data: ForgeResultData) => void)
    | undefined;
  if (!show) return;
  show(data);
}
