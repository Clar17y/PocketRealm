'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { ContributionList } from '@/components/common/ContributionList';
import { RoundLogContent } from '@/components/common/combat';
import {
  getExpeditionHistory,
  getExpeditionStatus,
} from '@/lib/api/expedition';
import type {
  ExpeditionAttemptLog,
  ExpeditionData,
  ExpeditionMemberData,
  ExpeditionRoundLog,
} from '@pocketrealm/shared';

// ---------------------------------------------------------------------------
// Round Log List
// ---------------------------------------------------------------------------

export function RoundLogList({ logs, playerId }: { logs: ExpeditionRoundLog[]; playerId: string | null }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const latestIdx = logs.length > 0 ? logs.length - 1 : null;
  const effectiveExpanded = expandedKey ?? (latestIdx !== null ? String(latestIdx) : null);

  const reversedLogs = logs.map((log, i) => ({ log, idx: i })).reverse();

  return (
    <PixelCard>
      <h4 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-2">Round Log</h4>
      <div className="space-y-1">
        {reversedLogs.map(({ log, idx }) => {
          const key = String(idx);
          const isExpanded = effectiveExpanded === key;
          const outcome = log.phases.outcome;
          return (
            <div key={key}>
              <button
                onClick={() => setExpandedKey(isExpanded ? null : key)}
                className="w-full flex justify-between items-center px-2 py-1 rounded text-xs hover:bg-[var(--rpg-surface)]"
              >
                <span className="text-[var(--rpg-text-primary)] font-bold">
                  {logs.some(l => l.roomIndex !== logs[0]?.roomIndex) ? `R${log.roomIndex + 1} · ` : ''}Round {log.round}
                </span>
                <div className="flex gap-2 text-xs">
                  {outcome.mobsKilled > 0 && (
                    <span className="text-[var(--rpg-green-light)]">{outcome.mobsKilled} killed</span>
                  )}
                  {outcome.playersKnockedOut > 0 && (
                    <span className="text-[var(--rpg-red)]">{outcome.playersKnockedOut} KO</span>
                  )}
                  {outcome.roomCleared && (
                    <span className="text-[var(--rpg-gold)]">CLEARED</span>
                  )}
                  {outcome.wipe && (
                    <span className="text-[var(--rpg-red)]">WIPE</span>
                  )}
                  <span className="text-[var(--rpg-text-secondary)]">{isExpanded ? '▲' : '▼'}</span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-2 pb-2">
                  <RoundLogContent log={log} playerId={playerId} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </PixelCard>
  );
}

// ---------------------------------------------------------------------------
// Previous Attempts Section (shared by active + history views)
// ---------------------------------------------------------------------------

export function PreviousAttemptsSection({
  attemptLogs,
  playerId,
}: {
  attemptLogs: ExpeditionAttemptLog[];
  playerId: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedAttempt, setSelectedAttempt] = useState(0);
  const attempt = attemptLogs[selectedAttempt];

  return (
    <PixelCard>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex justify-between items-center text-xs"
      >
        <span className="font-bold text-[var(--rpg-text-secondary)]">
          Previous Attempts ({attemptLogs.length})
        </span>
        <span className="text-[var(--rpg-text-secondary)]">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {attemptLogs.length > 1 && (
            <div className="flex gap-1 flex-wrap">
              {attemptLogs.map((a, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedAttempt(i)}
                  className={`px-2 py-0.5 text-[10px] rounded ${
                    selectedAttempt === i
                      ? 'bg-[var(--rpg-gold)] text-[var(--rpg-bg)] font-bold'
                      : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                  }`}
                >
                  Attempt {a.attempt}
                </button>
              ))}
            </div>
          )}
          {attempt && (
            <>
              <div className="text-[10px] text-[var(--rpg-text-secondary)]">
                Reached room {attempt.roomReached + 1} · {attempt.roundLogs.length} round{attempt.roundLogs.length !== 1 ? 's' : ''}
              </div>
              <ContributionList participants={attempt.participants ?? []} />
              {attempt.roundLogs.length > 0 && (
                <RoundLogList logs={attempt.roundLogs} playerId={playerId} />
              )}
            </>
          )}
        </div>
      )}
    </PixelCard>
  );
}

// ---------------------------------------------------------------------------
// History Detail Panel
// ---------------------------------------------------------------------------

function HistoryDetailPanel({
  expedition,
  members,
  playerId,
}: {
  expedition: ExpeditionData;
  members: ExpeditionMemberData[];
  playerId: string | null;
}) {
  const attempts = expedition.attemptLogs;
  const [selectedAttempt, setSelectedAttempt] = useState(attempts.length > 0 ? attempts.length - 1 : 0);

  const attempt = attempts[selectedAttempt];

  return (
    <div className="mt-3 pt-2 border-t border-[var(--rpg-border)] space-y-3">
      {attempts.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {attempts.map((a, i) => {
            const isSuccess = 'outcome' in a && (a as Record<string, unknown>).outcome === 'completed';
            return (
              <button
                key={i}
                onClick={() => setSelectedAttempt(i)}
                className={`px-2 py-0.5 text-[10px] rounded ${
                  selectedAttempt === i
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-bg)] font-bold'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
                }`}
              >
                Attempt {a.attempt}{isSuccess ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
      )}

      {attempt ? (
        <>
          <div className="text-[10px] text-[var(--rpg-text-secondary)]">
            Reached room {attempt.roomReached + 1} · {attempt.roundLogs.length} round{attempt.roundLogs.length !== 1 ? 's' : ''}
          </div>

          {attempt.participants && attempt.participants.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-1">Contributions</h4>
              <ContributionList participants={attempt.participants} />
            </div>
          )}

          {attempt.roundLogs.length > 0 && (
            <RoundLogList logs={attempt.roundLogs} playerId={playerId} />
          )}
        </>
      ) : (
        <>
          {members.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-1">Contributions</h4>
              <ContributionList participants={members} />
            </div>
          )}
          {expedition.roundLogs.length > 0 && (
            <RoundLogList logs={expedition.roundLogs} playerId={playerId} />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// History View
// ---------------------------------------------------------------------------

export function HistoryView({ guildId, playerId }: { guildId: string; playerId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [expeditions, setExpeditions] = useState<ExpeditionData[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<{ expedition: ExpeditionData; members: ExpeditionMemberData[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getExpeditionHistory(page).then(res => {
      if (cancelled) return;
      if (res.data) {
        setExpeditions(res.data.expeditions);
        setTotalPages(res.data.pagination.totalPages);
      }
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedDetail(null);
      return;
    }
    setExpandedId(id);
    const detail = await getExpeditionStatus(id);
    if (detail.data) setExpandedDetail(detail.data);
  };

  if (loading) return <SkeletonCard count={2} />;

  if (expeditions.length === 0) {
    return (
      <PixelCard>
        <p className="text-xs text-[var(--rpg-text-secondary)] text-center py-4">No expedition history yet.</p>
      </PixelCard>
    );
  }

  return (
    <div className="space-y-2">
      {expeditions.map(exp => (
        <PixelCard key={exp.id}>
          <button
            onClick={() => handleExpand(exp.id)}
            className="w-full text-left"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs font-bold text-[var(--rpg-text-primary)]">
                  {exp.themeName ?? `Tier ${exp.tier}`}
                </span>
                <span className={`ml-2 text-[10px] px-1.5 py-0 rounded ${
                  exp.status === 'completed'
                    ? 'bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]'
                    : 'bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]'
                }`}>
                  {exp.status === 'completed' ? 'Completed' : 'Failed'}
                </span>
              </div>
              <span className="text-[10px] text-[var(--rpg-text-secondary)]">
                {expandedId === exp.id ? '\u25B2' : '\u25BC'}
              </span>
            </div>
            <div className="flex gap-3 mt-1 text-[10px] text-[var(--rpg-text-secondary)]">
              <span>Room {exp.currentRoom + 1}/{exp.totalRooms}</span>
              {exp.wipeCount > 0 && <span>{exp.wipeCount} wipe{exp.wipeCount > 1 ? 's' : ''}</span>}
              <span>{new Date(exp.completedAt ?? exp.startedAt).toLocaleDateString()}</span>
            </div>
          </button>

          {expandedId === exp.id && expandedDetail && (
            <HistoryDetailPanel expedition={expandedDetail.expedition} members={expandedDetail.members} playerId={playerId} />
          )}
        </PixelCard>
      ))}

      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-2">
          <PixelButton size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            Prev
          </PixelButton>
          <span className="text-xs text-[var(--rpg-text-secondary)] self-center">
            {page} / {totalPages}
          </span>
          <PixelButton size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </PixelButton>
        </div>
      )}
    </div>
  );
}
