'use client';

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DockedActionBarProps {
  children: ReactNode;
  /** Optional overrides for the inner (content-column) wrapper's layout/padding. */
  className?: string;
}

export function DockedActionBar({ children, className }: DockedActionBarProps) {
  const bar = (
    <div
      className="fixed left-0 right-0 z-30 bg-[var(--rpg-surface)] border-t border-[var(--rpg-border)] shadow-[0_-4px_12px_rgba(0,0,0,0.25)]"
      style={{ bottom: 'var(--rpg-bottom-nav-offset)' }}
    >
      <div className={cn('max-w-lg lg:max-w-5xl mx-auto px-4 py-2', className)}>
        {children}
      </div>
    </div>
  );

  if (typeof document === 'undefined') return bar;
  return createPortal(bar, document.body);
}
