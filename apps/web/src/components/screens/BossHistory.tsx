'use client';

import { useCallback, useEffect, useState } from 'react';
import { getBossHistory, type BossHistoryEntry } from '@/lib/api';
import { Pagination } from '@/components/common/Pagination';
import { BossRewardsDisplay } from '@/components/common/BossRewardsDisplay';
import { monsterImageSrc } from '@/lib/assets';
import { ScreenContainer } from '../common/ScreenContainer';

const PAGE_SIZE = 10;

function statusBadge(status: string) {
  if (status === 'defeated') return { label: 'Defeated', color: 'var(--rpg-green-light)' };
  if (status === 'expired') return { label: 'Expired', color: 'var(--rpg-text-secondary)' };
  if (status === 'in_progress') return { label: 'In Progress', color: 'var(--rpg-gold)' };
  return { label: 'Waiting', color: 'var(--rpg-blue-light)' };
}

export function BossHistory() {
  const [entries, setEntries] = useState<BossHistoryEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchHistory = useCallback(async (p: number) => {
    setLoading(true);
    const res = await getBossHistory(p, PAGE_SIZE);
    if (res.data) {
      setEntries(res.data.entries);
      setTotalPages(res.data.pagination.totalPages);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchHistory(page); }, [page, fetchHistory]);

  if (loading && entries.length === 0) {
    return <div className="text-sm text-[var(--rpg-text-secondary)]">Loading boss history...</div>;
  }

  if (entries.length === 0) {
    return <div className="text-sm text-[var(--rpg-text-secondary)]">No boss encounters yet.</div>;
  }

  return (
    <ScreenContainer spacing="y-3">
      <h2 className="text-xl font-bold font-display text-[var(--rpg-text-primary)]">Boss History</h2>

      <div className="space-y-2">
        {entries.map((entry) => {
          const badge = statusBadge(entry.encounter.status);
          const isExpanded = expandedId === entry.encounter.id;
          const stats = entry.playerStats;

          return (
            <div
              key={entry.encounter.id}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3"
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => setExpandedId(isExpanded ? null : entry.encounter.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <img
                      src={monsterImageSrc(entry.mobName)}
                      alt={entry.mobName}
                      className="w-8 h-8 rounded object-cover shrink-0"
                    />
                    <span className="text-[var(--rpg-text-primary)] font-semibold font-display">
                      {entry.mobName} <span className="font-pixel font-normal">(Lv.{entry.mobLevel})</span>
                    </span>
                    <span className="text-xs ml-2 text-[var(--rpg-text-secondary)] font-display">
                      {entry.zoneName}
                    </span>
                  </div>
                  <span className="text-xs font-semibold" style={{ color: badge.color }}>
                    {badge.label}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-[var(--rpg-text-secondary)] mt-1">
                  <span><span className="font-pixel text-[8px]">{stats.roundsParticipated}</span> round{stats.roundsParticipated !== 1 ? 's' : ''}</span>
                  <span><span className="font-pixel text-[8px]">{stats.totalDamage.toLocaleString()}</span> dmg</span>
                  {stats.totalHealing > 0 && <span><span className="font-pixel text-[8px]">{stats.totalHealing.toLocaleString()}</span> healed</span>}
                  {stats.attacks > 0 && (
                    <span>
                      <span className="font-pixel text-[8px]">{stats.hits}/{stats.attacks}</span> hit
                      {stats.crits > 0 && <>, <span className="font-pixel text-[8px]">{stats.crits}</span> crit</>}
                    </span>
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="mt-3 pt-2 border-t border-[var(--rpg-border)] text-xs space-y-2">
                  {entry.killedByUsername && (
                    <p style={{ color: 'var(--rpg-gold)' }}>
                      Kill credit: <span className="font-display">{entry.killedByUsername}</span>
                    </p>
                  )}
                  <p>Total boss rounds: <span className="font-pixel text-[8px]">{entry.encounter.roundNumber}</span></p>

                  {entry.myRewards && (
                    <BossRewardsDisplay rewards={entry.myRewards} />
                  )}

                  {entry.encounter.roundSummaries && entry.encounter.roundSummaries.length > 0 && (
                    <div>
                      <p className="font-semibold mb-1">Round breakdown:</p>
                      <div className="space-y-1">
                        {entry.encounter.roundSummaries.map((rs) => (
                          <div key={rs.round} className="flex justify-between">
                            <span>Round <span className="font-pixel text-[8px]">{rs.round}</span></span>
                            <span>
                              Players: <span className="font-pixel text-[8px]">{rs.totalPlayerDamage.toLocaleString()}</span> dmg |
                              Boss: <span className="font-pixel text-[8px]">{rs.bossDamage.toLocaleString()}</span> dmg |
                              HP: <span className="font-pixel text-[8px]">{rs.bossHpPercent}%</span> | Alive: <span className="font-pixel text-[8px]">{rs.playersAlive}</span> Dead: <span className="font-pixel text-[8px]">{rs.playersDead}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </ScreenContainer>
  );
}
