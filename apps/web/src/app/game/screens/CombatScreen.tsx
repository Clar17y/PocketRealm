'use client';

import { useCallback, useState } from 'react';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { CombatLogEntry } from '@/components/combat/CombatLogEntry';
import { CombatPlayback } from '@/components/combat/CombatPlayback';
import { CombatRewardsSummary } from '@/components/combat/CombatRewardsSummary';
import { CombatHistory } from '@/components/screens/CombatHistory';
import { BossHistory } from '@/components/screens/BossHistory';
import { Pagination } from '@/components/common/Pagination';
import { formatCombatShareText, resolveMobMaxHp } from '@/lib/combatShare';
import { monsterImageSrc } from '@/lib/assets';
import { getMobPrefixDefinition } from '@adventure/shared';
import type { HpState, LastCombat, LastCombatLogEntry, PendingEncounter } from '../useGameController';

interface CombatScreenProps {
  hpState: HpState;
  currentZoneId: string | null;
  pendingEncounters: PendingEncounter[];
  pendingEncountersLoading: boolean;
  pendingEncountersError: string | null;
  pendingEncounterPage: number;
  pendingEncounterPagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  pendingEncounterFilters: {
    zones: Array<{ id: string; name: string }>;
    mobs: Array<{ id: string; name: string }>;
  };
  pendingEncounterZoneFilter: string;
  pendingEncounterMobFilter: string;
  pendingEncounterSort: 'recent' | 'danger';
  pendingClockMs: number;
  busyAction: string | null;
  lastCombat: LastCombat | null;
  bestiaryMobs: Array<{ id: string; isDiscovered: boolean }>;
  onStartCombat: (encounterSiteId: string) => void | Promise<void>;
  onSelectStrategy?: (encounterSiteId: string, strategy: 'full_clear' | 'room_by_room') => void | Promise<void>;
  onPendingEncounterPageChange: (page: number) => void;
  onPendingEncounterZoneFilterChange: (zoneId: string) => void;
  onPendingEncounterMobFilterChange: (mobTemplateId: string) => void;
  onPendingEncounterSortChange: (sort: 'recent' | 'danger') => void;
  combatPlaybackData?: {
    mobName: string;
    mobDisplayName: string;
    outcome: string;
    combatantAMaxHp: number;
    playerStartHp: number;
    combatantBMaxHp: number;
    log: LastCombatLogEntry[];
    rewards: LastCombat['rewards'];
  } | null;
  combatSpeedMs?: number;
  autoSkipCombat?: boolean;
  onCombatPlaybackComplete?: () => void;
  fightProgress?: { current: number; total: number } | null;
}

export function CombatScreen({
  hpState,
  currentZoneId,
  pendingEncounters,
  pendingEncountersLoading,
  pendingEncountersError,
  pendingEncounterPage,
  pendingEncounterPagination,
  pendingEncounterFilters,
  pendingEncounterZoneFilter,
  pendingEncounterMobFilter,
  pendingEncounterSort,
  pendingClockMs,
  busyAction,
  lastCombat,
  bestiaryMobs,
  onStartCombat,
  onSelectStrategy,
  onPendingEncounterPageChange,
  onPendingEncounterZoneFilterChange,
  onPendingEncounterMobFilterChange,
  onPendingEncounterSortChange,
  combatPlaybackData,
  combatSpeedMs,
  autoSkipCombat,
  onCombatPlaybackComplete,
  fightProgress,
}: CombatScreenProps) {
  const [activeView, setActiveView] = useState<'encounters' | 'history' | 'bossHistory'>('encounters');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [strategyModalSite, setStrategyModalSite] = useState<PendingEncounter | null>(null);

  const handleFightClick = (site: PendingEncounter) => {
    if (!site.clearStrategy) {
      setStrategyModalSite(site);
    } else {
      void onStartCombat(site.encounterSiteId);
    }
  };

  // Player max HP should be the player's real max HP.
  // Mob max HP comes from combat payload (supports wounded monster starts later).
  const playerMaxHp = hpState.maxHp;
  const mobMaxHp = lastCombat ? resolveMobMaxHp(lastCombat.log, lastCombat.combatantBMaxHp) : undefined;
  const isLastCombatMobDiscovered = lastCombat
    ? bestiaryMobs.find((mob) => mob.id === lastCombat.mobTemplateId)?.isDiscovered ?? false
    : false;

  const outcomeLabel = lastCombat?.outcome === 'victory'
    ? 'Victory'
    : lastCombat?.outcome === 'defeat'
      ? 'Defeat'
      : lastCombat?.outcome === 'fled'
        ? 'Fled'
        : lastCombat?.outcome;

  const outcomeColor = lastCombat?.outcome === 'victory'
    ? 'text-[var(--rpg-green-light)]'
    : lastCombat?.outcome === 'defeat'
      ? 'text-[var(--rpg-red)]'
      : 'text-[var(--rpg-gold)]';

  const buildShareText = useCallback((): string => {
    if (!lastCombat) return '';
    return formatCombatShareText({
      outcome: outcomeLabel ?? 'Unknown',
      playerMaxHp,
      mobMaxHp: lastCombat.combatantBMaxHp,
      mobName: lastCombat.mobDisplayName,
      log: lastCombat.log,
      rewards: lastCombat.rewards,
    });
  }, [lastCombat, mobMaxHp, outcomeLabel, playerMaxHp]);

  const handleCopyShare = useCallback(async () => {
    const text = buildShareText();
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [buildShareText]);

  return (
    <div className="space-y-4">
      {/* Strategy Selection Modal */}
      {strategyModalSite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-[var(--rpg-bg-dark,#1a1a2e)] border border-[var(--rpg-gold,#c8a84e)] rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-[var(--rpg-gold,#c8a84e)] font-bold text-lg mb-1">Choose Strategy</h3>
            <p className="text-[var(--rpg-light-dim,#a0a0b0)] text-sm mb-4">
              {strategyModalSite.siteName} — {strategyModalSite.totalRooms} room{strategyModalSite.totalRooms !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-col gap-3">
              <button
                className="bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold transition-all w-full text-left p-3"
                disabled={!!busyAction}
                onClick={async () => {
                  const siteId = strategyModalSite.encounterSiteId;
                  if (onSelectStrategy) {
                    await onSelectStrategy(siteId, 'full_clear');
                  }
                  setStrategyModalSite(null);
                  void onStartCombat(siteId);
                }}
              >
                <span className="font-bold block">Full Clear</span>
                <span className="text-xs opacity-80 block mt-1">Fight all rooms back-to-back. Better drops on success.</span>
              </button>
              <button
                className="bg-[var(--rpg-surface)] hover:bg-[var(--rpg-border)] text-[var(--rpg-text-primary)] border border-[var(--rpg-border)] rounded-lg font-semibold transition-all w-full text-left p-3"
                disabled={!!busyAction}
                onClick={async () => {
                  const siteId = strategyModalSite.encounterSiteId;
                  if (onSelectStrategy) {
                    await onSelectStrategy(siteId, 'room_by_room');
                  }
                  setStrategyModalSite(null);
                  void onStartCombat(siteId);
                }}
              >
                <span className="font-bold block">Room by Room</span>
                <span className="text-xs opacity-80 block mt-1">Clear one room at a time. Heal between rooms.</span>
              </button>
              <button
                className="text-[var(--rpg-light-dim,#a0a0b0)] text-sm mt-1 hover:text-white"
                onClick={() => setStrategyModalSite(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Knockout Banner */}
      {hpState.isRecovering && (
        <KnockoutBanner action="fighting" recoveryCost={hpState.recoveryCost} />
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setActiveView('encounters')}
          className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
            activeView === 'encounters'
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          Encounters
        </button>
        <button
          type="button"
          onClick={() => setActiveView('history')}
          className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
            activeView === 'history'
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          History
        </button>
        <button
          type="button"
          onClick={() => setActiveView('bossHistory')}
          className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
            activeView === 'bossHistory'
              ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
              : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          Boss History
        </button>
      </div>

      {activeView === 'bossHistory' ? (
        <BossHistory />
      ) : activeView === 'encounters' ? (
        <>
          <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-3">
            <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Encounter Sites</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={pendingEncounterSort}
                onChange={(event) => onPendingEncounterSortChange(event.target.value as 'recent' | 'danger')}
                className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
                disabled={pendingEncountersLoading}
              >
                <option value="danger">Sort: Most Dangerous</option>
                <option value="recent">Sort: Most Recent</option>
              </select>

              <select
                value={pendingEncounterZoneFilter}
                onChange={(event) => onPendingEncounterZoneFilterChange(event.target.value)}
                className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
                disabled={pendingEncountersLoading}
              >
                <option value="all">Zone: All</option>
                {pendingEncounterFilters.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>

              <select
                value={pendingEncounterMobFilter}
                onChange={(event) => onPendingEncounterMobFilterChange(event.target.value)}
                className="px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm"
                disabled={pendingEncountersLoading}
              >
                <option value="all">Family: All</option>
                {pendingEncounterFilters.mobs.map((mob) => (
                  <option key={mob.id} value={mob.id}>
                    {mob.name}
                  </option>
                ))}
              </select>
            </div>

            {pendingEncountersError && (
              <div className="text-sm text-[var(--rpg-red)]">{pendingEncountersError}</div>
            )}

            {!pendingEncountersError && pendingEncountersLoading && (
              <div className="text-sm text-[var(--rpg-text-secondary)]">Loading encounter sites...</div>
            )}

            {!pendingEncountersError && !pendingEncountersLoading && pendingEncounters.length === 0 && (
              <div className="text-sm text-[var(--rpg-text-secondary)]">No encounter sites match these filters.</div>
            )}

            {!pendingEncountersError && !pendingEncountersLoading && pendingEncounters.length > 0 && (
              <div className="space-y-2">
                {pendingEncounters.map((e) => {
                  const prefix = getMobPrefixDefinition(e.nextMobPrefix);
                  const nextMobLabel = e.nextMobName
                    ? (prefix ? `${prefix.displayName} ${e.nextMobName}` : e.nextMobName)
                    : null;
                  const isWrongZone = Boolean(currentZoneId) && e.zoneId !== currentZoneId;
                  const isDisabled = hpState.isRecovering || busyAction === 'combat' || !e.nextMobTemplateId || isWrongZone || !!combatPlaybackData;
                  return (
                    <div
                      key={e.encounterSiteId}
                      className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {e.nextMobName && (
                          <img
                            src={monsterImageSrc(e.nextMobName)}
                            alt={e.nextMobName}
                            className="w-10 h-10 rounded object-cover shrink-0"
                          />
                        )}
                        <div>
                          <div className="text-[var(--rpg-text-primary)] font-semibold">
                            {e.siteName}
                          </div>
                          <span className="text-xs text-[var(--rpg-text-secondary)]">
                            {e.totalRooms > 1
                              ? `Room ${e.currentRoom}/${e.totalRooms} · ${e.aliveMobs}/${e.totalMobs} mobs`
                              : `${e.aliveMobs}/${e.totalMobs} mobs`
                            }
                          </span>
                          {e.clearStrategy && (
                            <span className="text-xs text-[var(--rpg-gold)] ml-2">
                              {e.clearStrategy === 'full_clear' ? 'Full Clear' : 'Room by Room'}
                            </span>
                          )}
                          <div className="text-xs text-[var(--rpg-text-secondary)]">
                            Next monster: {nextMobLabel ?? 'None (site decayed)'}
                          </div>
                        <div className="text-xs text-[var(--rpg-text-secondary)]">
                          Zone: {e.zoneName} | Decayed {e.decayedMobs} | Found{' '}
                          {Math.max(0, Math.ceil((pendingClockMs - new Date(e.discoveredAt).getTime()) / 60000))}m ago
                        </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFightClick(e)}
                        disabled={isDisabled}
                        className={`px-3 py-2 rounded font-semibold ${
                          isDisabled
                            ? 'bg-[var(--rpg-border)] text-[var(--rpg-text-secondary)] cursor-not-allowed'
                            : 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                        }`}
                      >
                        {hpState.isRecovering
                          ? 'Recover First'
                          : isWrongZone
                            ? 'Wrong Zone'
                            : !e.nextMobTemplateId
                              ? 'Decayed'
                              : 'Fight'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {!pendingEncountersLoading && !pendingEncountersError && pendingEncounterPagination.totalPages > 1 && (
              <Pagination
                page={pendingEncounterPage}
                totalPages={pendingEncounterPagination.totalPages}
                onPageChange={onPendingEncounterPageChange}
                className="pt-1"
              />
            )}
          </div>

          {/* Combat Playback (animated) */}
          {combatPlaybackData && (
            <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3">
              {fightProgress && fightProgress.total > 1 && (
                <div className="text-sm text-[var(--rpg-gold)] font-semibold mb-2">
                  Fight {fightProgress.current}/{fightProgress.total}
                </div>
              )}
              <CombatPlayback
                key={fightProgress ? fightProgress.current : 0}
                mobDisplayName={combatPlaybackData.mobDisplayName}
                mobImageSrc={monsterImageSrc(combatPlaybackData.mobName)}
                outcome={combatPlaybackData.outcome}
                playerMaxHp={combatPlaybackData.combatantAMaxHp}
                playerStartHp={combatPlaybackData.playerStartHp}
                mobMaxHp={combatPlaybackData.combatantBMaxHp}
                log={combatPlaybackData.log}
                rewards={combatPlaybackData.rewards}
                speedMs={combatSpeedMs}
                autoSkip={autoSkipCombat}
                onComplete={onCombatPlaybackComplete ?? (() => {})}
                onSkip={() => {
                  onCombatPlaybackComplete?.();
                }}
              />
            </div>
          )}

          {/* Last Combat (detailed log — shown after playback completes) */}
          {!combatPlaybackData && lastCombat && (
            <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[var(--rpg-text-primary)] font-semibold">
                  <img
                    src={monsterImageSrc(lastCombat.mobName)}
                    alt={lastCombat.mobDisplayName}
                    className="w-8 h-8 rounded object-cover"
                  />
                  Last Combat: {lastCombat.mobDisplayName}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyShare()}
                    className="px-2.5 py-1.5 rounded border border-[var(--rpg-border)] text-xs text-[var(--rpg-text-primary)]"
                    title="Copy formatted log for sharing"
                  >
                    {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy Log'}
                  </button>
                  <div className={`text-sm font-semibold ${outcomeColor}`}>{outcomeLabel}</div>
                </div>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-0.5 border-t border-[var(--rpg-border)] pt-2">
                {lastCombat.log.map((entry, idx) => (
                  <CombatLogEntry
                    key={idx}
                    entry={entry}
                    playerMaxHp={playerMaxHp}
                    mobMaxHp={mobMaxHp}
                    showDetailedBreakdown={isLastCombatMobDiscovered}
                  />
                ))}
              </div>

              <div className="border-t border-[var(--rpg-border)] pt-2">
                <CombatRewardsSummary
                  rewards={lastCombat.rewards}
                  outcome={lastCombat.outcome}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <CombatHistory />
      )}
    </div>
  );
}

