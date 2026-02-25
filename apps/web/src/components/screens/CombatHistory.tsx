'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCombatLog,
  getCombatLogs,
  type CombatHistoryListItemResponse,
  type CombatHistoryResponse,
  type CombatOutcomeResponse,
  type CombatResultResponse,
} from '@/lib/api';
import { formatCombatShareText, resolveMobMaxHp, resolvePlayerMaxHp } from '@/lib/combatShare';
import { monsterImageSrc } from '@/lib/assets';
import { CombatLogEntry } from '@/components/combat/CombatLogEntry';
import { CombatRewardsSummary } from '@/components/combat/CombatRewardsSummary';
import { EventBadges } from '@/components/common/EventBadge';
import { Pagination } from '@/components/common/Pagination';

type OutcomeFilter = 'all' | CombatOutcomeResponse;

const PAGE_SIZE = 8;

function formatOutcome(outcome: string | null): string {
  if (outcome === 'victory') return 'Victory';
  if (outcome === 'defeat') return 'Defeat';
  if (outcome === 'fled') return 'Fled';
  return 'Unknown';
}

function outcomeIcon(outcome: string | null): string {
  if (outcome === 'victory') return 'V';
  if (outcome === 'defeat') return 'X';
  if (outcome === 'fled') return 'F';
  return '?';
}

function outcomeColor(outcome: string | null): string {
  if (outcome === 'victory') return 'text-[var(--rpg-green-light)]';
  if (outcome === 'defeat') return 'text-[var(--rpg-red)]';
  if (outcome === 'fled') return 'text-[var(--rpg-gold)]';
  return 'text-[var(--rpg-text-secondary)]';
}

function formatCombatSource(source: string | null | undefined): string {
  if (source === 'encounter_site') return 'Encounter Site';
  if (source === 'exploration_ambush') return 'Ambush (Exploring)';
  if (source === 'travel_ambush') return 'Ambush (Travel)';
  if (source === 'zone_combat') return 'Direct Encounter';
  return 'Unknown Source';
}

function relativeTime(iso: string): string {
  const deltaMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(deltaMs / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fullTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString();
}

export function CombatHistory() {
  const [history, setHistory] = useState<CombatHistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [zoneId, setZoneId] = useState('all');
  const [mobTemplateId, setMobTemplateId] = useState('all');
  const [sort, setSort] = useState<'recent' | 'xp'>('recent');

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CombatHistoryListItemResponse | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CombatResultResponse | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const latestDetailRequestRef = useRef(0);
  const selectedLogIdRef = useRef<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [outcome, zoneId, mobTemplateId, sort]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);

      const { data, error } = await getCombatLogs({
        page,
        pageSize: PAGE_SIZE,
        outcome: outcome === 'all' ? undefined : outcome,
        zoneId: zoneId === 'all' ? undefined : zoneId,
        mobTemplateId: mobTemplateId === 'all' ? undefined : mobTemplateId,
        sort,
        search: search || undefined,
      });

      if (cancelled) return;

      if (!data) {
        setHistoryError(error?.message ?? 'Failed to load combat history');
        setHistory(null);
        setSelectedEntry(null);
        setSelectedLogId(null);
        return;
      }

      setHistory(data);
      setSelectedLogId((previous) => {
        if (previous) {
          const current = data.logs.find((row) => row.logId === previous) ?? null;
          if (current) {
            setSelectedEntry(current);
            return previous;
          }
        }

        if (data.logs.length > 0) {
          setSelectedEntry(data.logs[0]);
          return data.logs[0].logId;
        }

        setSelectedEntry(null);
        setSelectedDetail(null);
        return null;
      });
    };

    void loadHistory().finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [page, outcome, zoneId, mobTemplateId, sort, search]);

  useEffect(() => {
    selectedLogIdRef.current = selectedLogId;
    if (!selectedLogId) {
      setSelectedLoading(false);
    }
  }, [selectedLogId]);

  const loadDetail = useCallback(async (logId: string) => {
    const requestId = ++latestDetailRequestRef.current;
    setSelectedLoading(true);
    setSelectedError(null);

    const { data, error } = await getCombatLog(logId);
    const isStale = latestDetailRequestRef.current !== requestId || selectedLogIdRef.current !== logId;
    if (isStale) return;

    if (!data) {
      setSelectedDetail(null);
      setSelectedError(error?.message ?? 'Failed to load combat log');
      setSelectedLoading(false);
      return;
    }

    setSelectedDetail(data.combat);
    setSelectedLoading(false);
  }, []);

  useEffect(() => {
    if (!selectedLogId) return;
    void loadDetail(selectedLogId);
  }, [selectedLogId, loadDetail]);

  const playerMaxHp = useMemo(
    () => selectedDetail ? resolvePlayerMaxHp(selectedDetail.log, selectedDetail.playerMaxHp) : undefined,
    [selectedDetail]
  );
  const mobMaxHp = useMemo(
    () => selectedDetail ? resolveMobMaxHp(selectedDetail.log, selectedDetail.mobMaxHp) : undefined,
    [selectedDetail]
  );

  const rows = history?.logs ?? [];

  const shareText = useMemo(() => {
    if (!selectedEntry || !selectedDetail) return '';
    return formatCombatShareText({
      outcome: formatOutcome(selectedDetail.outcome),
      mobName: selectedDetail.mobDisplayName ?? selectedEntry.mobDisplayName ?? selectedEntry.mobName ?? 'Unknown Mob',
      zoneName: selectedEntry.zoneName ?? 'Unknown Zone',
      createdAt: fullTimestamp(selectedEntry.createdAt),
      playerMaxHp: selectedDetail.playerMaxHp,
      mobMaxHp: selectedDetail.mobMaxHp,
      log: selectedDetail.log,
      rewards: selectedDetail.rewards,
    });
  }, [selectedDetail, selectedEntry]);

  const handleCopyShare = useCallback(async () => {
    if (!shareText) return;

    try {
      await navigator.clipboard.writeText(shareText);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [shareText]);

  return (
    <div className="space-y-3">
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-3">
        <div className="text-[var(--rpg-text-primary)] font-semibold">Combat History</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search mob or zone..."
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
          />

          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as 'recent' | 'xp')}
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
          >
            <option value="recent">Sort: Most Recent</option>
            <option value="xp">Sort: Most XP</option>
          </select>

          <select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as OutcomeFilter)}
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
          >
            <option value="all">Outcome: All</option>
            <option value="victory">Outcome: Victory</option>
            <option value="defeat">Outcome: Defeat</option>
            <option value="fled">Outcome: Fled</option>
          </select>

          <select
            value={zoneId}
            onChange={(event) => setZoneId(event.target.value)}
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
          >
            <option value="all">Zone: All</option>
            {(history?.filters.zones ?? []).map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name}
              </option>
            ))}
          </select>

          <select
            value={mobTemplateId}
            onChange={(event) => setMobTemplateId(event.target.value)}
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm sm:col-span-2"
          >
            <option value="all">Mob: All</option>
            {(history?.filters.mobs ?? []).map((mob) => (
              <option key={mob.id} value={mob.id}>
                {mob.name}
              </option>
            ))}
          </select>
        </div>

        {historyError && (
          <div className="text-sm text-[var(--rpg-red)]">{historyError}</div>
        )}

        {!historyError && historyLoading && (
          <div className="text-sm text-[var(--rpg-text-secondary)]">Loading combat history...</div>
        )}

        {!historyError && !historyLoading && rows.length === 0 && (
          <div className="text-sm text-[var(--rpg-text-secondary)]">No combat logs match these filters.</div>
        )}

        {!historyError && !historyLoading && rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((entry) => (
              <button
                key={entry.logId}
                type="button"
                onClick={() => {
                  setSelectedEntry(entry);
                  setSelectedLogId(entry.logId);
                }}
                className={`w-full text-left border rounded-lg p-2 transition-colors ${
                  selectedLogId === entry.logId
                    ? 'border-[var(--rpg-gold)] bg-[var(--rpg-background)]'
                    : 'border-[var(--rpg-border)] bg-[var(--rpg-surface)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm text-[var(--rpg-text-primary)] font-semibold truncate">
                    {entry.mobName && (
                      <img
                        src={monsterImageSrc(entry.mobName)}
                        alt={entry.mobName}
                        className="w-8 h-8 rounded object-cover shrink-0"
                      />
                    )}
                    <span className="truncate">
                      <span className={outcomeColor(entry.outcome)}>{outcomeIcon(entry.outcome)}</span>
                      {' '}
                      {entry.mobDisplayName ?? entry.mobName ?? 'Unknown Mob'}
                    </span>
                  </div>
                  <div className={`text-xs font-semibold ${outcomeColor(entry.outcome)}`}>
                    {formatOutcome(entry.outcome)}
                  </div>
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                  {entry.zoneName ?? 'Unknown Zone'} | {relativeTime(entry.createdAt)}
                </div>
                <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                  Source: {formatCombatSource(entry.source)} | Rounds: {entry.roundCount} | XP: {entry.xpGained.toLocaleString()}
                </div>
              </button>
            ))}
          </div>
        )}

        {history && history.pagination.totalPages > 1 && (
          <Pagination
            page={history.pagination.page}
            totalPages={history.pagination.totalPages}
            onPageChange={setPage}
            className="pt-1"
          />
        )}
      </div>

      {selectedEntry && (
        <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--rpg-text-primary)] font-semibold flex-wrap">
              {(selectedDetail?.mobName ?? selectedEntry.mobName) && (
                <img
                  src={monsterImageSrc((selectedDetail?.mobName ?? selectedEntry.mobName)!)}
                  alt={selectedDetail?.mobDisplayName ?? selectedEntry.mobName ?? 'Mob'}
                  className="w-8 h-8 rounded object-cover shrink-0"
                />
              )}
              {selectedDetail?.mobDisplayName ?? selectedEntry.mobDisplayName ?? selectedEntry.mobName ?? 'Combat'} Log
              {selectedDetail?.eventModifiers && selectedDetail.eventModifiers.length > 0 && (
                <EventBadges inline modifiers={selectedDetail.eventModifiers} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopyShare()}
                disabled={!selectedDetail}
                className="px-2.5 py-1.5 rounded border border-[var(--rpg-border)] text-xs text-[var(--rpg-text-primary)] disabled:opacity-40"
                title="Copy formatted log for sharing"
              >
                {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy Log'}
              </button>
              <div className={`text-sm font-semibold ${outcomeColor(selectedEntry.outcome)}`}>
                {formatOutcome(selectedEntry.outcome)}
              </div>
            </div>
          </div>

          <div className="text-xs text-[var(--rpg-text-secondary)]">
            {fullTimestamp(selectedEntry.createdAt)} | {selectedEntry.zoneName ?? 'Unknown Zone'} | {formatCombatSource(selectedEntry.source)}
          </div>

          {selectedError && <div className="text-sm text-[var(--rpg-red)]">{selectedError}</div>}
          {selectedLoading && <div className="text-sm text-[var(--rpg-text-secondary)]">Loading combat log...</div>}

          {!selectedLoading && selectedDetail && (
            <>
              <div className="max-h-72 overflow-y-auto space-y-0.5 border-t border-[var(--rpg-border)] pt-2">
                {selectedDetail.log.map((entry, index) => (
                  <CombatLogEntry
                    key={index}
                    entry={entry}
                    playerMaxHp={playerMaxHp}
                    mobMaxHp={mobMaxHp}
                  />
                ))}
              </div>

              <div className="border-t border-[var(--rpg-border)] pt-2">
                <CombatRewardsSummary rewards={selectedDetail.rewards} outcome={selectedDetail.outcome} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
