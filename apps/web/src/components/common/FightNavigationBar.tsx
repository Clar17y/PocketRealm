'use client';

interface FightNavigationBarProps {
  currentIndex: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  subtitle?: string;
}

export function FightNavigationBar({ currentIndex, total, onPrev, onNext, subtitle }: FightNavigationBarProps) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--rpg-border)] pb-2 mb-2">
      <button
        type="button"
        disabled={currentIndex === 0}
        onClick={onPrev}
        className="px-2 py-1 rounded text-sm border border-[var(--rpg-border)] text-[var(--rpg-text-primary)] hover:bg-[var(--rpg-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Prev
      </button>
      <div className="text-sm text-[var(--rpg-text-secondary)]">
        <span className="text-[var(--rpg-gold)] font-semibold">
          Fight {currentIndex + 1}/{total}
        </span>
        {subtitle && (
          <span className="ml-2">— {subtitle}</span>
        )}
      </div>
      <button
        type="button"
        disabled={currentIndex === total - 1}
        onClick={onNext}
        className="px-2 py-1 rounded text-sm border border-[var(--rpg-border)] text-[var(--rpg-text-primary)] hover:bg-[var(--rpg-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
