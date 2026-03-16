'use client';

import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';
import type { QuestProgressUpdate } from '@pocketrealm/shared';

let _questSeq = 0;

export function QuestToast() {
  const queue = useToastQueue<QuestProgressUpdate>({
    globalKey: '__showQuestToast',
    maxVisible: 3,
    autoDismissMs: 3000,
    makeItem: (raw) => ({ id: `quest-${raw.questId}-${++_questSeq}`, data: raw }),
  });

  if (queue.isEmpty) return null;

  return (
    <ToastContainer
      position="top-left"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      overflowLabel={`+${queue.overflow} more quest update${queue.overflow > 1 ? 's' : ''}`}
      cardClassName={(item) =>
        `bg-[var(--rpg-surface)] border rounded-lg px-4 py-3 shadow-lg animate-[slideIn_0.3s_ease-out] min-w-[250px] transition-colors ${
          item.data.completed
            ? 'border-[var(--rpg-gold)]'
            : 'border-[var(--rpg-border)] hover:border-[var(--rpg-gold)]/50'
        }`
      }
      renderToast={(item) => {
        const { data } = item;
        const pct = Math.min(Math.round((data.current / data.target) * 100), 100);

        return (
          <div className="flex items-center gap-2">
            <span className="text-lg shrink-0">
              {data.completed ? '\u{1F3AF}' : '\u{1F4DC}'}
            </span>
            <div className="flex-1 min-w-0">
              {data.completed ? (
                <>
                  <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
                    Quest Complete
                  </p>
                  <p className="text-sm font-medium text-[var(--rpg-gold)]">
                    {data.questName}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
                    Quest Progress
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--rpg-text-primary)] truncate">
                      {data.questName}
                    </p>
                    <span className="text-xs text-[var(--rpg-gold)] font-medium shrink-0">
                      {data.current}/{data.target}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-[var(--rpg-border)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[var(--rpg-gold)] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        );
      }}
    />
  );
}
