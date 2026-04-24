'use client';

import type { CrownCounts } from '@/lib/api/social';

interface CrownChipsProps {
  crowns: CrownCounts;
  compact?: boolean;
}

function crownTotal(crowns: CrownCounts): number {
  return crowns.total ?? crowns.gold + crowns.silver + crowns.bronze;
}

function CrownChip({
  label,
  value,
  className,
  compact,
}: {
  label: string;
  value?: number;
  className: string;
  compact?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-6 min-w-0 items-center gap-1 rounded border px-2 font-pixel text-[10px] leading-none ${compact ? 'h-5 px-1.5 text-[9px]' : ''} ${className}`}
    >
      <span className="shrink-0">{label}</span>
      {typeof value === 'number' && <span className="tabular-nums">{value}</span>}
    </span>
  );
}

export function CrownChips({ crowns, compact = false }: CrownChipsProps) {
  const total = crownTotal(crowns);

  return (
    <div className={`flex flex-wrap justify-end gap-1 ${compact ? 'gap-0.5' : ''}`} aria-label={`${total} ${total === 1 ? 'crown' : 'crowns'}`}>
      <CrownChip
        label="G"
        value={crowns.gold}
        compact={compact}
        className="border-[var(--rpg-gold)]/40 bg-[var(--rpg-gold)]/10 text-[var(--rpg-gold)]"
      />
      <CrownChip
        label="S"
        value={crowns.silver}
        compact={compact}
        className="border-gray-300/30 bg-gray-300/10 text-gray-200"
      />
      <CrownChip
        label="B"
        value={crowns.bronze}
        compact={compact}
        className="border-amber-700/40 bg-amber-700/10 text-amber-500"
      />
      <CrownChip
        label={`${total} ${total === 1 ? 'crown' : 'crowns'}`}
        compact={compact}
        className="border-[var(--rpg-border)] bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)]"
      />
    </div>
  );
}
