'use client';

import { useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { PixelCard } from './PixelCard';
import type { ActivityLogEntry } from '@/app/game/gameController.types';

const TYPE_COLORS: Record<ActivityLogEntry['type'], string> = {
  info: 'text-[var(--rpg-text-secondary)]',
  success: 'text-[var(--rpg-green-light)]',
  danger: 'text-[var(--rpg-red)]',
  warning: 'text-[var(--rpg-gold)]',
};

interface ActivityLogProps {
  entries: ActivityLogEntry[];
  maxHeight?: string;
}

export function ActivityLog({ entries, maxHeight = 'max-h-64' }: ActivityLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new entries are prepended
  useEffect(() => {
    if (scrollRef.current && entries.length > 0) {
      scrollRef.current.scrollTop = 0;
    }
  }, [entries.length]);

  return (
    <PixelCard>
      <h3 className="font-semibold font-almendra text-[var(--rpg-text-primary)] mb-3">Recent Activity</h3>
      <div ref={scrollRef} className={`space-y-2 ${maxHeight} overflow-y-auto`}>
        {entries.length === 0 ? (
          <div className="text-sm text-[var(--rpg-text-secondary)] text-center py-4">
            No recent activity
          </div>
        ) : (
          entries.map((entry, index) => (
            <div key={index} className="flex gap-2 text-sm">
              <Clock size={14} className="text-[var(--rpg-text-secondary)] flex-shrink-0 mt-0.5" />
              <span className="text-[var(--rpg-text-secondary)] flex-shrink-0 font-pixel text-[16px]">
                {entry.timestamp}
              </span>
              <span className={TYPE_COLORS[entry.type]}>{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </PixelCard>
  );
}
