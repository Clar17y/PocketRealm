'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Toast {
  id: string;
  title: string;
  category: string;
}

interface AchievementToastProps {
  onNavigate?: (category: string) => void;
}

const MAX_VISIBLE = 5;

export function AchievementToast({ onNavigate }: AchievementToastProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__showAchievementToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__showAchievementToast;
    };
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClick = (toast: Toast) => {
    dismiss(toast.id);
    onNavigate?.(toast.category);
  };

  if (toasts.length === 0) return null;

  const visible = toasts.slice(0, MAX_VISIBLE);
  const overflow = toasts.length - MAX_VISIBLE;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {visible.map((toast) => (
        <div
          key={toast.id}
          className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg px-4 py-3 shadow-lg animate-[slideIn_0.3s_ease-out] min-w-[250px] cursor-pointer hover:border-[var(--rpg-gold)]/80 transition-colors"
          onClick={() => handleClick(toast)}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">&#x1F3C6;</span>
            <div className="flex-1">
              <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
                Achievement Unlocked
              </p>
              <p className="text-sm font-medium text-[var(--rpg-gold)]">
                {toast.title}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
              className="p-0.5 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)]/50 rounded-lg px-4 py-2 shadow-lg text-center cursor-pointer hover:border-[var(--rpg-gold)] transition-colors"
          onClick={() => { setToasts([]); onNavigate?.('achievements'); }}
        >
          <p className="text-xs text-[var(--rpg-gold)]">
            and {overflow} more achievement{overflow > 1 ? 's' : ''} unlocked
          </p>
        </div>
      )}
    </div>
  );
}
