'use client';

import { useEffect, useRef } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { cn } from '@/lib/utils';

interface PlaybackSurfaceProps {
  mode: 'overlay' | 'stage';
  title: string;
  subtitle?: string;
  progressLabel?: string;
  active?: boolean;
  autoScrollOnActive?: boolean;
  dimBackground?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function PlaybackSurface({
  mode,
  title,
  subtitle,
  progressLabel,
  active = true,
  autoScrollOnActive = mode === 'overlay',
  dimBackground = mode === 'overlay',
  className,
  children,
}: PlaybackSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const hasScrolledForActivationRef = useRef(false);

  useEffect(() => {
    if (!autoScrollOnActive) {
      hasScrolledForActivationRef.current = false;
      return;
    }

    if (!active) {
      hasScrolledForActivationRef.current = false;
      return;
    }

    if (hasScrolledForActivationRef.current) return;
    hasScrolledForActivationRef.current = true;

    const frameId = window.requestAnimationFrame(() => {
      surfaceRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [active, autoScrollOnActive]);

  return (
    <div
      ref={surfaceRef}
      className={cn(
        mode === 'overlay'
          ? 'sticky top-2 z-30'
          : 'relative',
        className,
      )}
    >
      <PixelCard
        variant="ornate"
        padding="sm"
        className={cn(
          'overflow-hidden border-[var(--rpg-gold)]/30 shadow-[0_18px_50px_rgba(0,0,0,0.35)]',
          mode === 'overlay' && 'backdrop-blur-sm',
          dimBackground && mode === 'overlay' && 'bg-[color:color-mix(in_srgb,var(--rpg-surface)_92%,black_8%)]',
        )}
      >
        <div className="bg-[radial-gradient(circle_at_top,rgba(212,168,75,0.16),transparent_65%)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--rpg-border)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--rpg-text-secondary)]">
                Playback
              </p>
              <h3 className="font-almendra text-xl font-bold text-[var(--rpg-text-primary)]">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-1 text-sm text-[var(--rpg-text-secondary)]">
                  {subtitle}
                </p>
              )}
            </div>

            {progressLabel && (
              <div className="shrink-0 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1 text-right">
                <span className="font-pixel text-[8px] text-[var(--rpg-gold)]">
                  {progressLabel}
                </span>
              </div>
            )}
          </div>

          <div className="px-4 py-4">
            {children}
          </div>
        </div>
      </PixelCard>
    </div>
  );
}
