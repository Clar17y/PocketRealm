'use client';

import { Medal } from 'lucide-react';
import { PlayerTitle } from '@/components/common/PlayerTitle';
import type { CrownCollectorEntry } from '@/lib/api/social';
import { CrownChips } from './CrownChips';

interface CrownCollectorsTableProps {
  entries: CrownCollectorEntry[];
  myRank: CrownCollectorEntry | null;
  loading: boolean;
  totalPlayers: number;
  lastRefreshedAt: string | null;
  showAroundMe: boolean;
  onToggleAroundMe: () => void;
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  return `${minutes} min ago`;
}

function RankBadge({ rank, highlighted }: { rank: number; highlighted: boolean }) {
  if (rank === 1) {
    return (
      <span className="font-bold text-[var(--rpg-gold)]">
        <Medal className="inline h-4 w-4" /> 1
      </span>
    );
  }

  if (rank === 2) {
    return (
      <span className="font-bold text-gray-300">
        <Medal className="inline h-4 w-4" /> 2
      </span>
    );
  }

  if (rank === 3) {
    return (
      <span className="font-bold text-amber-600">
        <Medal className="inline h-4 w-4" /> 3
      </span>
    );
  }

  return <span className={highlighted ? 'font-bold text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)]'}>#{rank}</span>;
}

function CrownCollectorRow({
  entry,
  highlighted,
}: {
  entry: CrownCollectorEntry;
  highlighted: boolean;
}) {
  const topGroup = entry.topGroups[0];

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
        highlighted
          ? 'border border-[var(--rpg-gold)]/40 bg-[var(--rpg-gold)]/15'
          : 'bg-[var(--rpg-surface)]'
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-12 shrink-0 text-right">
          <RankBadge rank={entry.rank} highlighted={highlighted} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className={`truncate ${highlighted ? 'font-semibold text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-primary)]'}`}>
              {entry.username}
            </span>
            {entry.title && (
              <PlayerTitle
                title={entry.title}
                titleTier={entry.titleTier}
                titleStyle={entry.titleStyle}
                className="shrink-0 text-[10px]"
                bracketed
              />
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--rpg-text-secondary)]">
            <span>
              Lv.<span className="font-pixel text-[8px]">{entry.characterLevel}</span>
            </span>
            {topGroup && <span className="truncate">{topGroup.group}</span>}
          </div>
        </div>
      </div>
      <div className="shrink-0">
        <CrownChips crowns={entry.crowns} compact />
      </div>
    </div>
  );
}

export function CrownCollectorsTable({
  entries,
  myRank,
  loading,
  totalPlayers,
  lastRefreshedAt,
  showAroundMe,
  onToggleAroundMe,
}: CrownCollectorsTableProps) {
  if (loading) {
    return (
      <div className="py-8 text-center text-[var(--rpg-text-secondary)]">
        Loading crown collectors...
      </div>
    );
  }

  if (entries.length === 0 && !myRank) {
    return (
      <div className="py-8 text-center text-[var(--rpg-text-secondary)]">
        No crowns awarded yet.
      </div>
    );
  }

  const includesMyRank = !!myRank && entries.some((entry) => entry.rank === myRank.rank);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 text-xs text-[var(--rpg-text-secondary)]">
        <span>{totalPlayers.toLocaleString()} collectors ranked</span>
        {lastRefreshedAt && <span>Updated {timeSince(lastRefreshedAt)}</span>}
      </div>

      {entries.length > 0 && (
        <div className="space-y-1">
          {entries.map((entry) => (
            <CrownCollectorRow
              key={entry.rank}
              entry={entry}
              highlighted={myRank?.rank === entry.rank}
            />
          ))}
        </div>
      )}

      {myRank && (
        <button
          type="button"
          onClick={onToggleAroundMe}
          className="w-full py-2 text-sm text-[var(--rpg-gold)] transition-colors hover:text-[var(--rpg-gold)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rpg-gold)]"
        >
          {showAroundMe ? 'Back to Top' : 'View My Rank'}
        </button>
      )}

      {!showAroundMe && myRank && !includesMyRank && (
        <div className="mt-2 border-t border-[var(--rpg-border)] pt-2">
          <CrownCollectorRow entry={myRank} highlighted />
        </div>
      )}
    </div>
  );
}
