'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

const TOOLTIP_TEXT = 'Your XP rate decreases as you train a skill within each 6-hour window. Take a break or train other skills!';

export function XpRateTooltip() {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        className="text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((s) => !s)}
        aria-label="XP Rate info"
      >
        <Info size={14} />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs text-[var(--rpg-text-primary)] bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg shadow-lg w-56 z-50">
          {TOOLTIP_TEXT}
        </div>
      )}
    </span>
  );
}
