'use client';

import type { LeaderboardEntry } from '@/lib/api';
import { Bot, Medal, Shield } from 'lucide-react';
import { rarityFromTier, RARITY_COLORS } from '@/lib/rarity';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  myRank: LeaderboardEntry | null;
  currentPlayerId: string | null;
  loading: boolean;
  totalPlayers: number;
  lastRefreshedAt: string | null;
  showAroundMe?: boolean;
  onToggleAroundMe?: () => void;
}

function formatScore(score: number): string {
  if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
  if (score >= 10_000) return `${(score / 1_000).toFixed(1)}K`;
  return score.toLocaleString();
}

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 min ago';
  return `${minutes} min ago`;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-[var(--rpg-gold)] font-bold"><Medal className="w-4 h-4 inline" /> 1</span>;
  if (rank === 2) return <span className="text-gray-300 font-bold"><Medal className="w-4 h-4 inline" /> 2</span>;
  if (rank === 3) return <span className="text-amber-600 font-bold"><Medal className="w-4 h-4 inline" /> 3</span>;
  return <span className="text-[var(--rpg-text-secondary)]">#{rank}</span>;
}

export function LeaderboardTable({
  entries,
  myRank,
  currentPlayerId,
  loading,
  totalPlayers,
  lastRefreshedAt,
  showAroundMe = false,
  onToggleAroundMe,
}: LeaderboardTableProps) {
  if (loading) {
    return (
      <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
        Loading rankings...
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
        No rankings available yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header info */}
      <div className="flex justify-between items-center text-xs text-[var(--rpg-text-secondary)] px-1">
        <span>{totalPlayers.toLocaleString()} players ranked</span>
        {lastRefreshedAt && <span>Updated {timeSince(lastRefreshedAt)}</span>}
      </div>

      {/* Entries */}
      <div className="space-y-1">
        {entries.map((entry) => {
          const isMe = entry.playerId === currentPlayerId;
          return (
            <div
              key={entry.playerId}
              className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                isMe
                  ? 'bg-[var(--rpg-gold)]/15 border border-[var(--rpg-gold)]/40'
                  : 'bg-[var(--rpg-surface)]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 text-right shrink-0">
                  <RankBadge rank={entry.rank} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <span className={`truncate ${isMe ? 'text-[var(--rpg-gold)] font-semibold' : 'text-[var(--rpg-text-primary)]'}`}>
                      {entry.username}
                    </span>
                    {entry.title && (
                      <span className="text-[10px] shrink-0" style={{ color: RARITY_COLORS[rarityFromTier(entry.titleTier ?? 1)] }}>
                        &lt;{entry.title}&gt;
                      </span>
                    )}
                    {entry.isBot && <Bot className="w-3.5 h-3.5 text-[var(--rpg-text-secondary)] shrink-0" />}
                    {entry.isAdmin && <Shield className="w-3.5 h-3.5 text-[var(--rpg-gold)] shrink-0" />}
                  </div>
                  <span className="text-xs text-[var(--rpg-text-secondary)]">Lv.{entry.characterLevel}</span>
                </div>
              </div>
              <div className="text-right font-mono text-[var(--rpg-text-primary)] shrink-0">
                {formatScore(entry.score)}
              </div>
            </div>
          );
        })}
      </div>

      {/* View my rank / Back to top toggle */}
      {onToggleAroundMe && myRank && (
        <button
          onClick={onToggleAroundMe}
          className="w-full py-2 text-sm text-[var(--rpg-gold)] hover:text-[var(--rpg-gold)]/80 transition-colors"
        >
          {showAroundMe ? 'Back to Top' : 'View My Rank'}
        </button>
      )}

      {/* Pinned "Your rank" bar (shown when viewing top N, not around_me) */}
      {!showAroundMe && myRank && !entries.some((e) => e.playerId === currentPlayerId) && (
        <div className="mt-2 border-t border-[var(--rpg-border)] pt-2">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg text-sm bg-[var(--rpg-gold)]/15 border border-[var(--rpg-gold)]/40">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 text-right shrink-0">
                <span className="text-[var(--rpg-gold)] font-bold">#{myRank.rank}</span>
              </div>
              <div className="min-w-0">
                <span className="text-[var(--rpg-gold)] font-semibold truncate">{myRank.username}</span>
                {myRank.title && (
                  <span className="text-[10px] ml-1" style={{ color: RARITY_COLORS[rarityFromTier(myRank.titleTier ?? 1)] }}>
                    &lt;{myRank.title}&gt;
                  </span>
                )}
                <span className="text-xs text-[var(--rpg-text-secondary)] ml-1">Lv.{myRank.characterLevel}</span>
              </div>
            </div>
            <div className="text-right font-mono text-[var(--rpg-text-primary)] shrink-0">
              {formatScore(myRank.score)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
