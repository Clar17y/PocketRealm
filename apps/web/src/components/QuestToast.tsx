'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { QuestProgressUpdate } from '@pocketrealm/shared';

interface QuestToastItem {
  id: string;
  update: QuestProgressUpdate;
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3000;

export function QuestToast() {
  const [toasts, setToasts] = useState<QuestToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__showQuestToast = (update: QuestProgressUpdate) => {
      const id = `quest-${update.questId}-${Date.now()}`;
      setToasts((prev) => [...prev, { id, update }]);

      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, AUTO_DISMISS_MS);
      timersRef.current.set(id, timer);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__showQuestToast;
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  };

  if (toasts.length === 0) return null;

  const visible = toasts.slice(0, MAX_VISIBLE);
  const overflow = toasts.length - MAX_VISIBLE;

  return (
    <div className="fixed top-4 left-4 z-50 space-y-2">
      {visible.map((toast) => {
        const { update } = toast;
        const isCompleted = update.completed;
        const pct = Math.min(Math.round((update.current / update.target) * 100), 100);

        return (
          <div
            key={toast.id}
            className={`bg-[var(--rpg-surface)] border rounded-lg px-4 py-3 shadow-lg animate-[slideIn_0.3s_ease-out] min-w-[250px] transition-colors ${
              isCompleted
                ? 'border-[var(--rpg-gold)]'
                : 'border-[var(--rpg-border)] hover:border-[var(--rpg-gold)]/50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg shrink-0">
                {isCompleted ? '\u{1F3AF}' : '\u{1F4DC}'}
              </span>
              <div className="flex-1 min-w-0">
                {isCompleted ? (
                  <>
                    <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
                      Quest Complete
                    </p>
                    <p className="text-sm font-medium text-[var(--rpg-gold)]">
                      {update.questName}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
                      Quest Progress
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[var(--rpg-text-primary)] truncate">
                        {update.questName}
                      </p>
                      <span className="text-xs text-[var(--rpg-gold)] font-medium shrink-0">
                        {update.current}/{update.target}
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
              <button
                onClick={() => dismiss(toast.id)}
                className="p-0.5 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors shrink-0"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)]/50 rounded-lg px-4 py-2 shadow-lg text-center">
          <p className="text-xs text-[var(--rpg-gold)]">
            +{overflow} more quest update{overflow > 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  );
}
