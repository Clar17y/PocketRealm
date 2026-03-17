'use client';

import { useMemo } from 'react';
import { formatNumber } from '@/lib/format';

interface Participant {
  playerId: string;
  username?: string | null;
  totalDamage: number;
  totalHealing: number;
}

interface ContributionListProps {
  participants: Participant[];
  limit?: number;
}

export function ContributionList({ participants, limit }: ContributionListProps) {
  const sorted = useMemo(
    () =>
      [...participants]
        .sort((a, b) => (b.totalDamage + b.totalHealing) - (a.totalDamage + a.totalHealing))
        .slice(0, limit ?? participants.length),
    [participants, limit],
  );

  if (sorted.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {sorted.map((m, i) => (
        <div key={m.playerId} className="flex justify-between text-xs">
          <span className="text-[var(--rpg-text-secondary)]">
            <span className="text-[var(--rpg-gold)] font-bold w-4 inline-block">{i + 1}.</span>
            {m.username ?? m.playerId.slice(0, 8)}
          </span>
          <div className="flex gap-2 text-[10px]">
            <span className="text-[var(--rpg-red)]">{formatNumber(m.totalDamage)} dmg</span>
            {m.totalHealing > 0 && (
              <span className="text-[var(--rpg-green-light)]">{formatNumber(m.totalHealing)} heal</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
