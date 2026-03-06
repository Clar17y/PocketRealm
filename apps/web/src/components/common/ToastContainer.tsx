'use client';

import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { ToastItem } from '@/hooks/useToastQueue';

interface ToastContainerProps<T> {
  /** Screen position. */
  position: 'top-left' | 'top-right';
  /** Visible toast items from useToastQueue. */
  visible: ToastItem<T>[];
  /** Overflow count from useToastQueue. */
  overflow: number;
  /** Dismiss callback from useToastQueue. */
  dismiss: (id: string) => void;
  /** Render the content of a single toast card. */
  renderToast: (item: ToastItem<T>) => ReactNode;
  /** Optional className override per toast card. Receives the item. */
  cardClassName?: (item: ToastItem<T>) => string;
  /** Optional click handler for a toast. */
  onClickToast?: (item: ToastItem<T>) => void;
  /** Optional click handler for the overflow indicator. */
  onClickOverflow?: () => void;
  /** Overflow label text. */
  overflowLabel?: string;
}

const POSITION_CLASSES = {
  'top-left': 'fixed top-4 left-4 z-50 space-y-2',
  'top-right': 'fixed top-4 right-4 z-50 space-y-2',
};

const DEFAULT_CARD_CLASS =
  'bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg px-4 py-3 shadow-lg animate-[slideIn_0.3s_ease-out] min-w-[250px] transition-colors';

export function ToastContainer<T>({
  position,
  visible,
  overflow,
  dismiss,
  renderToast,
  cardClassName,
  onClickToast,
  onClickOverflow,
  overflowLabel,
}: ToastContainerProps<T>) {
  return (
    <div className={POSITION_CLASSES[position]}>
      {visible.map((item) => (
        <div
          key={item.id}
          className={`${cardClassName?.(item) ?? DEFAULT_CARD_CLASS} ${onClickToast ? 'cursor-pointer' : ''}`}
          onClick={onClickToast ? () => onClickToast(item) : undefined}
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              {renderToast(item)}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(item.id); }}
              className="p-0.5 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div
          className={`bg-[var(--rpg-surface)] border border-[var(--rpg-gold)]/50 rounded-lg px-4 py-2 shadow-lg text-center ${onClickOverflow ? 'cursor-pointer hover:border-[var(--rpg-gold)] transition-colors' : ''}`}
          onClick={onClickOverflow}
        >
          <p className="text-xs text-[var(--rpg-gold)]">
            {overflowLabel ?? `+${overflow} more`}
          </p>
        </div>
      )}
    </div>
  );
}
