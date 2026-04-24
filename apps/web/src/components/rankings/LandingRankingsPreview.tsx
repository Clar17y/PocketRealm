'use client';

import { useEffect, useState } from 'react';
import {
  getPublicLeaderboardSummary,
  type CrownCollectorEntry,
  type PublicLeaderboardSummaryResponse,
  type PublicSummaryWeeklyLeader,
} from '@/lib/api';
import { CrownChips } from './CrownChips';

const scoreFormatter = new Intl.NumberFormat('en-GB');

function formatScore(score: number): string {
  return scoreFormatter.format(score);
}

function CrownCollectorRow({ entry }: { entry: CrownCollectorEntry }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/45 px-3 py-2">
      <span className="shrink-0 font-pixel text-[10px] text-[var(--rpg-text-secondary)]">#{entry.rank}</span>
      <span className="min-w-0 flex-1 truncate font-crimson text-sm font-semibold text-[var(--rpg-text-primary)]">
        {entry.username}
      </span>
      <div className="shrink-0">
        <CrownChips crowns={entry.crowns} compact />
      </div>
    </li>
  );
}

function WeeklyLeaderRow({ entry }: { entry: PublicSummaryWeeklyLeader }) {
  return (
    <li className="flex min-w-0 items-center gap-3 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/45 px-3 py-2">
      <span className="shrink-0 font-pixel text-[10px] text-[var(--rpg-text-secondary)]">#{entry.rank}</span>
      <span className="min-w-0 flex-1 truncate font-crimson text-sm font-semibold text-[var(--rpg-text-primary)]">
        {entry.username}
      </span>
      <span className="shrink-0 truncate text-right font-crimson text-xs text-[var(--rpg-text-secondary)]">
        {entry.label}: {formatScore(entry.score)}
      </span>
    </li>
  );
}

export function LandingRankingsPreview() {
  const [summary, setSummary] = useState<PublicLeaderboardSummaryResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getPublicLeaderboardSummary()
      .then((res) => {
        if (!cancelled && !res.error && res.data) {
          setSummary(res.data);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  if (!summary) {
    return null;
  }

  return (
    <section className="mb-8 rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-surface)] p-4 text-left rpg-card-texture">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-almendra text-xl font-bold text-[var(--rpg-gold)]">Realm Rankings</h3>
        <a href="/rankings" className="shrink-0 font-crimson text-sm font-semibold text-[var(--rpg-gold)] hover:text-[var(--rpg-gold-light)]">
          View Rankings
        </a>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <h4 className="mb-2 font-pixel text-[10px] uppercase text-[var(--rpg-text-secondary)]">Crown Collectors</h4>
          {summary.crownCollectors.length > 0 ? (
            <ul className="space-y-2">
              {summary.crownCollectors.map((entry) => (
                <CrownCollectorRow key={`${entry.rank}-${entry.username}`} entry={entry} />
              ))}
            </ul>
          ) : (
            <p className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/45 px-3 py-2 font-crimson text-sm text-[var(--rpg-text-secondary)]">
              No crowns awarded yet.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <h4 className="mb-2 font-pixel text-[10px] uppercase text-[var(--rpg-text-secondary)]">Weekly Race</h4>
          {summary.weeklyLeaders.length > 0 ? (
            <ul className="space-y-2">
              {summary.weeklyLeaders.map((entry) => (
                <WeeklyLeaderRow key={`${entry.category}-${entry.rank}-${entry.username}`} entry={entry} />
              ))}
            </ul>
          ) : (
            <p className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/45 px-3 py-2 font-crimson text-sm text-[var(--rpg-text-secondary)]">
              Weekly race starts after the next snapshot.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
