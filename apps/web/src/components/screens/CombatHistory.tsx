'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCombatLog,
  getCombatLogs,
  getEncounterSiteFights,
  type CombatHistoryListItemResponse,
  type CombatHistoryResponse,
  type CombatOutcomeResponse,
  type CombatSourceResponse,
  type CombatResultResponse,
  type EncounterSiteFightSummary,
} from '@/lib/api';
import { formatCombatShareText, resolveMobMaxHp, resolvePlayerMaxHp } from '@/lib/combatShare';
import { monsterImageSrc } from '@/lib/assets';
import { relativeTime } from '@/lib/format';
import { CombatLogEntry } from '@/components/combat/CombatLogEntry';
import { CombatRewardsSummary } from '@/components/combat/CombatRewardsSummary';
import { RoundLogContent } from '@/components/common/combat';
import type { ExpeditionRoundLog } from '@pocketrealm/shared';
import { EventBadges } from '@/components/common/EventBadge';
import { CopyButton } from '@/components/common/CopyButton';
import { FightNavigationBar } from '@/components/common/FightNavigationBar';
import { Pagination } from '@/components/common/Pagination';
import { ScreenContainer } from '../common/ScreenContainer';

type OutcomeFilter = 'all' | CombatOutcomeResponse;
type SourceFilter = 'all' | CombatSourceResponse;

const PAGE_SIZE = 8;

function formatOutcome(outcome: string | null): string {
  if (outcome === 'victory' || outcome === 'cleared' || outcome === 'site_cleared') return 'Victory';
  if (outcome === 'defeat' || outcome === 'defeated') return 'Defeat';
  if (outcome === 'fled') return 'Fled';
  return 'Unknown';
}

function outcomeIcon(outcome: string | null): string {
  if (outcome === 'victory' || outcome === 'cleared' || outcome === 'site_cleared') return 'V';
  if (outcome === 'defeat' || outcome === 'defeated') return 'X';
  if (outcome === 'fled') return 'F';
  return '?';
}

function outcomeColor(outcome: string | null): string {
  if (outcome === 'victory' || outcome === 'cleared' || outcome === 'site_cleared') return 'text-[var(--rpg-green-light)]';
  if (outcome === 'defeat' || outcome === 'defeated') return 'text-[var(--rpg-red)]';
  if (outcome === 'fled') return 'text-[var(--rpg-gold)]';
  return 'text-[var(--rpg-text-secondary)]';
}

function formatCombatSource(source: string | null | undefined): string {
  if (source === 'encounter_site') return 'Encounter Site';
  if (source === 'encounter_site_room') return 'Encounter Room';
  if (source === 'exploration_ambush') return 'Ambush (Exploring)';
  if (source === 'travel_ambush') return 'Ambush (Travel)';
  if (source === 'zone_combat') return 'Direct Encounter';
  return 'Unknown Source';
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
  const [source, setSource] = useState<SourceFilter>('all');
  const [zoneId, setZoneId] = useState('all');
  const [mobTemplateId, setMobTemplateId] = useState('all');
  const [sort, setSort] = useState<'recent' | 'xp'>('recent');

  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<CombatHistoryListItemResponse | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CombatResultResponse | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [siteFights, setSiteFights] = useState<EncounterSiteFightSummary[] | null>(null);
  const [siteFightIndex, setSiteFightIndex] = useState(0);
  const [siteFightsLoading, setSiteFightsLoading] = useState(false);
  const [summaryRewards, setSummaryRewards] = useState<CombatResultResponse['rewards'] | null>(null);
  const latestDetailRequestRef = useRef(0);
  const latestFightRequestRef = useRef(0);
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
  }, [outcome, source, zoneId, mobTemplateId, sort]);

  useEffect(() => {
    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);

      const { data, error } = await getCombatLogs({
        page,
        pageSize: PAGE_SIZE,
        outcome: outcome === 'all' ? undefined : outcome,
        source: source === 'all' ? undefined : source,
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
        setSiteFights(null);
        setSiteFightIndex(0);
        setSummaryRewards(null);
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

        // New page — clear stale detail before selecting first entry
        setSelectedDetail(null);
        if (data.logs.length > 0) {
          setSelectedEntry(data.logs[0]);
          return data.logs[0].logId;
        }

        setSelectedEntry(null);
        setSelectedDetail(null);
        setSiteFights(null);
        setSiteFightIndex(0);
        setSummaryRewards(null);
        return null;
      });
    };

    void loadHistory().finally(() => {
      if (!cancelled) setHistoryLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [page, outcome, source, zoneId, mobTemplateId, sort, search]);

  useEffect(() => {
    selectedLogIdRef.current = selectedLogId;
    if (!selectedLogId) {
      setSelectedLoading(false);
    }
  }, [selectedLogId]);

  const loadDetail = useCallback(async (logId: string, entry: CombatHistoryListItemResponse) => {
    const requestId = ++latestDetailRequestRef.current;
    setSelectedLoading(true);
    setSelectedError(null);
    setSiteFights(null);
    setSiteFightIndex(0);
    setSummaryRewards(null);

    const { data, error } = await getCombatLog(logId);
    const isStale = latestDetailRequestRef.current !== requestId || selectedLogIdRef.current !== logId;
    if (isStale) return;

    if (!data) {
      setSelectedDetail(null);
      setSelectedError(error?.message ?? 'Failed to load combat log');
      setSelectedLoading(false);
      return;
    }

    // For encounter site entries with multiple fights, fetch fights list and show first fight
    if (entry.source === 'encounter_site' && entry.fightCount > 1) {
      setSummaryRewards(data.combat.rewards);
      setSiteFightsLoading(true);
      try {
        const fightsData = await getEncounterSiteFights(logId);
        const stillValid = latestDetailRequestRef.current === requestId && selectedLogIdRef.current === logId;
        if (!stillValid) return;

        setSiteFights(fightsData.fights);
        setSiteFightIndex(0);
        if (fightsData.fights.length > 0) {
          const firstFightRes = await getCombatLog(fightsData.fights[0].logId);
          const stillValid2 = latestDetailRequestRef.current === requestId && selectedLogIdRef.current === logId;
          if (!stillValid2) return;
          if (firstFightRes.data) {
            setSelectedDetail(firstFightRes.data.combat);
          }
        } else {
          setSelectedDetail(data.combat);
        }
      } catch {
        if (latestDetailRequestRef.current === requestId && selectedLogIdRef.current === logId) {
          setSiteFights(null);
          setSelectedDetail(data.combat);
        }
      } finally {
        if (latestDetailRequestRef.current === requestId && selectedLogIdRef.current === logId) {
          setSiteFightsLoading(false);
          setSelectedLoading(false);
        }
      }
    } else {
      setSelectedDetail(data.combat);
      setSelectedLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedLogId || !selectedEntry) return;
    void loadDetail(selectedLogId, selectedEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLogId, loadDetail]);

  const handleSiteFightNavigate = useCallback(async (newIndex: number) => {
    if (!siteFights || !siteFights[newIndex]) return;
    const fightReqId = ++latestFightRequestRef.current;
    const detailReqId = latestDetailRequestRef.current;
    setSiteFightIndex(newIndex);
    setSelectedLoading(true);
    setSelectedError(null);
    const isStale = () =>
      latestFightRequestRef.current !== fightReqId || latestDetailRequestRef.current !== detailReqId;
    try {
      const { data, error } = await getCombatLog(siteFights[newIndex].logId);
      if (isStale()) return;
      if (!data) {
        setSelectedError(error?.message ?? 'Failed to load fight log');
      } else {
        setSelectedDetail(data.combat);
      }
    } catch (err) {
      if (isStale()) return;
      setSelectedError((err as Error).message);
    } finally {
      if (!isStale()) {
        setSelectedLoading(false);
      }
    }
  }, [siteFights]);

  const playerMaxHp = useMemo(
    () => selectedDetail ? resolvePlayerMaxHp(selectedDetail.log ?? [], selectedDetail.playerMaxHp) : undefined,
    [selectedDetail]
  );
  const mobMaxHp = useMemo(
    () => selectedDetail ? resolveMobMaxHp(selectedDetail.log ?? [], selectedDetail.mobMaxHp) : undefined,
    [selectedDetail]
  );

  const rows = history?.logs ?? [];

  const shareText = useMemo(() => {
    if (!selectedEntry || !selectedDetail) return '';
    if (selectedEntry.source === 'encounter_site_room') return '';
    if (!selectedDetail.rewards || !selectedDetail.log) return '';
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

  return (
    <ScreenContainer spacing="y-3">
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-3">
        <div className="text-[var(--rpg-text-primary)] font-semibold font-almendra">Combat History</div>

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
            value={source}
            onChange={(event) => setSource(event.target.value as SourceFilter)}
            className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
          >
            <option value="all">Source: All</option>
            <option value="encounter_site_room">Encounter Room</option>
            <option value="encounter_site">Encounter Site</option>
            <option value="zone_combat">Direct Encounter</option>
            <option value="exploration_ambush">Ambush (Exploring)</option>
            <option value="travel_ambush">Ambush (Travel)</option>
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
                  setSelectedDetail(null);
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
                    {entry.source === 'encounter_site_room' ? (
                      <>
                        <span className="truncate">
                          <span className={outcomeColor(entry.outcome)}>{outcomeIcon(entry.outcome)}</span>
                          {' '}
                          {entry.siteName ?? 'Unknown Site'}
                        </span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--rpg-blue-light)]/10 text-[var(--rpg-blue-light)] font-pixel font-normal">
                          Room {entry.siteRoom}/{entry.siteTotalRooms}
                        </span>
                      </>
                    ) : (
                      <>
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
                          {entry.source === 'encounter_site' && entry.fightCount > 1
                            ? (entry.mobFamilyName ?? entry.mobDisplayName ?? entry.mobName ?? 'Unknown Mob')
                            : (entry.mobDisplayName ?? entry.mobName ?? 'Unknown Mob')}
                        </span>
                        {entry.source === 'encounter_site' && entry.fightCount > 1 && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-[var(--rpg-gold)]/10 text-[var(--rpg-gold)] font-pixel font-normal">
                            {entry.fightCount} fights
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className={`text-xs font-semibold ${outcomeColor(entry.outcome)}`}>
                    {formatOutcome(entry.outcome)}
                  </div>
                </div>
                {entry.source === 'encounter_site_room' ? (
                  <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                    {entry.mobFamilyName ?? 'Unknown'} | {entry.siteMode === 'auto' ? 'Auto' : 'Manual'} | {entry.zoneName ?? 'Unknown Zone'} | {relativeTime(entry.createdAt)}
                  </div>
                ) : (
                  <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                    {entry.zoneName ?? 'Unknown Zone'} | {relativeTime(entry.createdAt)}
                  </div>
                )}
                <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                  Source: {formatCombatSource(entry.source)} | Rounds: <span className="font-pixel text-[8px]">{entry.roundCount}</span> | XP: <span className="font-pixel text-[8px]">{entry.xpGained.toLocaleString()}</span>
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
            <div className="flex items-center gap-2 text-[var(--rpg-text-primary)] font-semibold font-almendra flex-wrap">
              {selectedEntry.source !== 'encounter_site_room' && (selectedDetail?.mobName ?? selectedEntry.mobName) && (
                <img
                  src={monsterImageSrc((selectedDetail?.mobName ?? selectedEntry.mobName)!)}
                  alt={selectedDetail?.mobDisplayName ?? selectedEntry.mobName ?? 'Mob'}
                  className="w-8 h-8 rounded object-cover shrink-0"
                />
              )}
              {selectedEntry.source === 'encounter_site_room'
                ? `${selectedEntry.siteName ?? 'Encounter Site'} — Room ${selectedEntry.siteRoom}/${selectedEntry.siteTotalRooms}`
                : `${selectedDetail?.mobDisplayName ?? selectedEntry.mobDisplayName ?? selectedEntry.mobName ?? 'Combat'} Log`}
              {selectedDetail?.eventModifiers && selectedDetail.eventModifiers.length > 0 && (
                <EventBadges inline modifiers={selectedDetail.eventModifiers} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <CopyButton text={shareText} disabled={!selectedDetail || !shareText} />
              <div className={`text-sm font-semibold ${outcomeColor(selectedEntry.outcome)}`}>
                {formatOutcome(selectedEntry.outcome)}
              </div>
            </div>
          </div>

          <div className="text-xs text-[var(--rpg-text-secondary)]">
            {fullTimestamp(selectedEntry.createdAt)} | {selectedEntry.zoneName ?? 'Unknown Zone'} | {formatCombatSource(selectedEntry.source)}
          </div>

          {selectedError && <div className="text-sm text-[var(--rpg-red)]">{selectedError}</div>}
          {(selectedLoading || siteFightsLoading) && <div className="text-sm text-[var(--rpg-text-secondary)]">Loading combat log...</div>}

          {!selectedLoading && !siteFightsLoading && selectedDetail && (
            <>
              {siteFights && siteFights.length > 1 && (
                <FightNavigationBar
                  currentIndex={siteFightIndex}
                  total={siteFights.length}
                  onPrev={() => void handleSiteFightNavigate(siteFightIndex - 1)}
                  onNext={() => void handleSiteFightNavigate(siteFightIndex + 1)}
                  subtitle={siteFights[siteFightIndex]?.mobDisplayName ?? undefined}
                />
              )}

              {selectedEntry.source === 'encounter_site_room' ? (
                <div className="max-h-96 overflow-y-auto space-y-3 border-t border-[var(--rpg-border)] pt-2">
                  {(selectedDetail.rounds ?? []).map((entry: Record<string, unknown>, i: number) => {
                    // Auto-resolve stores RoundSnapshot[] ({roundNumber, log, ...}),
                    // manual stores ExpeditionRoundLog[] ({round, phases, ...}).
                    const roundLog = entry.phases ? entry : entry.log;
                    const roundNum = entry.round ?? entry.roundNumber ?? i + 1;
                    if (!roundLog || typeof roundLog !== 'object' || !('phases' in roundLog)) return null;
                    return (
                      <div key={i}>
                        <p className="text-xs font-bold text-[var(--rpg-text-secondary)] mb-1">Round {roundNum as number}</p>
                        <RoundLogContent log={roundLog as ExpeditionRoundLog} playerId={null} />
                      </div>
                    );
                  })}
                  {!!selectedDetail.chestReward && (
                    <div className="border-t border-[var(--rpg-border)] pt-2 text-xs text-[var(--rpg-gold)]">
                      Chest reward received on site completion
                    </div>
                  )}
                </div>
              ) : (
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
                    <CombatRewardsSummary
                      rewards={summaryRewards ?? selectedDetail.rewards}
                      outcome={selectedDetail.outcome}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </ScreenContainer>
  );
}
