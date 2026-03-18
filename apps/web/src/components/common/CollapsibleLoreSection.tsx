'use client';

import { useState, useEffect, useId } from 'react';
import { ChevronRight } from 'lucide-react';

interface CollapsibleLoreSectionProps {
  title: string;
  storageKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsibleLoreSection({
  title,
  storageKey,
  children,
  defaultExpanded = false,
}: CollapsibleLoreSectionProps) {
  const contentId = useId();
  const fullKey = `lore-collapsed:${storageKey}`;

  const [expanded, setExpanded] = useState(() => {
    if (typeof window === 'undefined') return defaultExpanded;
    const stored = sessionStorage.getItem(fullKey);
    if (stored !== null) return stored === 'true';
    return defaultExpanded;
  });

  useEffect(() => {
    sessionStorage.setItem(fullKey, String(expanded));
  }, [expanded, fullKey]);

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex items-center gap-1 w-full text-left group"
      >
        <ChevronRight
          size={14}
          className={`text-[var(--rpg-text-secondary)] transition-transform duration-200 ${
            expanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-xs font-semibold text-[var(--rpg-gold)] uppercase tracking-wide">
          {title}
        </span>
      </button>
      <div
        id={contentId}
        className={`overflow-hidden transition-all duration-200 ${
          expanded ? 'max-h-96 opacity-100 mt-1' : 'max-h-0 opacity-0'
        }`}
      >
        {children}
      </div>
    </div>
  );
}
