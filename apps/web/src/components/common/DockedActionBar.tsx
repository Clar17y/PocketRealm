'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DockedActionBarProps {
  children: ReactNode;
  /** Optional overrides for the inner (content-column) wrapper's layout/padding. */
  className?: string;
}

export function DockedActionBar({ children, className }: DockedActionBarProps) {
  const barRef = useRef<HTMLDivElement>(null);

  // Publish the bar's height so globally-fixed bottom UI (e.g. ChatPanel) can
  // offset above it. Reset to 0px on unmount so other screens are unaffected.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty('--rpg-docked-bar-height', `${el.offsetHeight}px`);
    };
    publish();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(publish);
      observer.observe(el);
    }

    return () => {
      observer?.disconnect();
      root.style.setProperty('--rpg-docked-bar-height', '0px');
    };
  }, []);

  const bar = (
    <div
      ref={barRef}
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
