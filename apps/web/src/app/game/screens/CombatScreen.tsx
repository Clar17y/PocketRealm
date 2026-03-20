'use client';

import { useEffect, useMemo, useState } from 'react';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
import { ModalOverlay } from '@/components/common/ModalOverlay';
import { LowHpWarningDialog } from '@/components/common/LowHpWarningDialog';
import { CombatLogEntry } from '@/components/combat/CombatLogEntry';
import { CombatPlayback } from '@/components/combat/CombatPlayback';
import { CombatRewardsSummary } from '@/components/combat/CombatRewardsSummary';
import { PlaybackSurface } from '@/components/playback/PlaybackSurface';
import { CombatHistory } from '@/components/screens/CombatHistory';
import { FightNavigationBar } from '@/components/common/FightNavigationBar';
import { BossHistory } from '@/components/screens/BossHistory';
import { Pagination } from '@/components/common/Pagination';
import { EventBadges } from '@/components/common/EventBadge';
import type { CombatActiveEvent } from '@/lib/api';
import { formatCombatShareText, resolveMobMaxHp } from '@/lib/combatShare';
import { CopyButton } from '@/components/common/CopyButton';
import { XpRateBadge } from '@/components/common/XpRateBadge';
import { monsterImageSrc } from '@/lib/assets';
import { relativeTime } from '@/lib/format';
import { getMobPrefixDefinition, HP_CONSTANTS } from '@pocketrealm/shared';
import type { HpState, LastCombat, LastCombatLogEntry, PendingEncounter } from '../gameController.types';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { SubNav } from '@/components/common/SubNav';

interface CombatScreenProps {
  hpState: HpState;
  isOverEncumbered?: boolean;
  currentTurns: number;
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
    playerStartStamina?: number;
    playerStartMana?: number;
    combatantBMaxHp: number;
    log: LastCombatLogEntry[] | null;
    rewards: LastCombat['rewards'];
    activeEvents?: CombatActiveEvent[];
  } | null;
  combatSpeedMs?: number;
  autoSkipCombat?: boolean;
  onCombatPlaybackComplete?: () => void;
  fightProgress?: { current: number; total: number; room?: number } | null;
  roomTransition?: { entering: number } | null;
  lowHpWarning?: boolean;
  onQuickRest?: () => Promise<void>;
  quickRestPercent?: number;
  onNavigateToRest?: () => void;
  combatXpRate?: { skillName: string; rate: number };
  staminaState?: { current: number; max: number; regenPerSecond: number };
  manaState?: { current: number; max: number; regenPerSecond: number };
  isOffline?: boolean;
}

export function CombatScreen({
  hpState,
  isOverEncumbered,
  currentTurns,
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
  roomTransition,
  lowHpWarning,
  onQuickRest,
  quickRestPercent,
  onNavigateToRest,
  combatXpRate,
  staminaState,
  manaState,
  isOffline,
}: CombatScreenProps) {
  const [activeView, setActiveView] = useState<'encounters' | 'history' | 'bossHistory'>('encounters');
  const [strategyModalSite, setStrategyModalSite] = useState<PendingEncounter | null>(null);
  const [lowHpPendingSite, setLowHpPendingSite] = useState<PendingEncounter | null>(null);
  const [lastCombatFightIndex, setLastCombatFightIndex] = useState(0);
  const [lastCombatCollapsed, setLastCombatCollapsed] = useState(false);

  useEffect(() => {
    setLastCombatFightIndex(lastCombat?.fights ? lastCombat.fights.length - 1 : 0);
    setLastCombatCollapsed(false);
  }, [lastCombat]);

  const displayedFight = lastCombat?.fights?.[lastCombatFightIndex] ?? lastCombat;

  const handleFightClick = (site: PendingEncounter) => {
    if (
      lowHpWarning &&
      hpState.maxHp > 0 &&
      (hpState.currentHp / hpState.maxHp) < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD
    ) {
      setLowHpPendingSite(site);
      return;
    }
    if (!site.clearStrategy) {
      setStrategyModalSite(site);
    } else {
      void onStartCombat(site.encounterSiteId);
    }
  };

  const proceedWithFight = (site: PendingEncounter) => {
    setLowHpPendingSite(null);
    if (!site.clearStrategy) {
      setStrategyModalSite(site);
    } else {
      void onStartCombat(site.encounterSiteId);
    }
  };

  // Player max HP should be the player's real max HP.
  // Mob max HP comes from combat payload (supports wounded monster starts later).
  const playerMaxHp = hpState.maxHp;
  const mobMaxHp = displayedFight ? resolveMobMaxHp(displayedFight.log, displayedFight.combatantBMaxHp) : undefined;
  const isLastCombatMobDiscovered = displayedFight
    ? bestiaryMobs.find((mob) => mob.id === displayedFight.mobTemplateId)?.isDiscovered ?? false
    : false;

  const outcomeLabel = displayedFight?.outcome === 'victory'
    ? 'Victory'
    : displayedFight?.outcome === 'defeat'
      ? 'Defeat'
      : displayedFight?.outcome === 'fled'
        ? 'Fled'
        : displayedFight?.outcome;

  const outcomeColor = displayedFight?.outcome === 'victory'
    ? 'text-[var(--rpg-green-light)]'
    : displayedFight?.outcome === 'defeat'
      ? 'text-[var(--rpg-red)]'
      : 'text-[var(--rpg-gold)]';

  const shareText = useMemo((): string => {
    if (!lastCombat || !displayedFight) return '';
    return formatCombatShareText({
      outcome: outcomeLabel ?? 'Unknown',
      playerMaxHp,
      mobMaxHp: displayedFight.combatantBMaxHp,
      mobName: displayedFight.mobDisplayName,
      log: displayedFight.log,
      rewards: lastCombat.rewards,
    });
  }, [lastCombat, displayedFight, mobMaxHp, outcomeLabel, playerMaxHp]);

  return (
    <ScreenContainer>
      {/* Strategy Selection Modal */}
      {strategyModalSite && (
        <ModalOverlay>
          <div className="bg-[var(--rpg-bg-dark,#1a1a2e)] border border-[var(--rpg-gold,#c8a84e)] rounded-lg p-6 max-w-sm w-full mx-4">
            <h3 className="text-[var(--rpg-gold,#c8a84e)] font-bold text-lg mb-1">Choose Strategy</h3>
            <p className="text-[var(--rpg-light-dim,#a0a0b0)] text-sm mb-4">
              {strategyModalSite.siteName} — {strategyModalSite.totalRooms} room{strategyModalSite.totalRooms !== 1 ? 's' : ''}
            </p>
            <div className="flex flex-col gap-3">
              <button
                className="bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold transition-all w-full text-left p-3"
                disabled={!!busyAction || isOffline}
                title={isOffline ? "You're offline" : undefined}
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
                disabled={!!busyAction || isOffline}
                title={isOffline ? "You're offline" : undefined}
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
        </ModalOverlay>
      )}

      {/* Low HP Warning Dialog */}
      {lowHpPendingSite && (
        <LowHpWarningDialog
          currentHp={hpState.currentHp}
          maxHp={hpState.maxHp}
          onProceed={() => proceedWithFight(lowHpPendingSite)}
          onCancel={() => setLowHpPendingSite(null)}
        />
      )}

      {/* Knockout Banner */}
      {hpState.isRecovering && (
        <KnockoutBanner action="fighting" recoveryCost={hpState.recoveryCost} onClick={onNavigateToRest} />
      )}

      {/* Resource Status */}
      {!combatPlaybackData && !hpState.isRecovering && (
        <ResourceStatusBar
          currentHp={hpState.currentHp}
          maxHp={hpState.maxHp}
          currentStamina={staminaState?.current ?? 0}
          maxStamina={staminaState?.max ?? 0}
          currentMana={manaState?.current ?? 0}
          maxMana={manaState?.max ?? 0}
          hpRegenPerSecond={hpState.regenPerSecond}
          staminaRegenPerSecond={staminaState?.regenPerSecond}
          manaRegenPerSecond={manaState?.regenPerSecond}
          onQuickRest={onQuickRest}
          quickRestPercent={quickRestPercent}
          busyAction={busyAction}
          isOffline={isOffline}
        />
      )}

      <SubNav
        tabs={[
          { id: 'encounters', label: 'Encounters' },
          { id: 'history', label: 'History' },
          { id: 'bossHistory', label: 'Boss History' },
        ]}
        activeId={activeView}
        onSelect={setActiveView}
        ariaLabel="Combat navigation"
      />

      {activeView === 'bossHistory' ? (
        <BossHistory />
      ) : activeView === 'encounters' ? (
        <>
          {/* Room transition interstitial */}
          {roomTransition && (
            <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)]/30 rounded-lg p-6 text-center">
              <div className="text-lg font-bold text-[var(--rpg-gold)] mb-1">
                Entering Room <span className="font-pixel font-normal text-[12px]">{roomTransition.entering}</span>
              </div>
              <div className="text-sm text-[var(--rpg-text-secondary)]">
                Prepare for the next fight...
              </div>
            </div>
          )}

          {/* Combat Playback (animated) */}
          {combatPlaybackData && !roomTransition && (
            <PlaybackSurface
              mode="stage"
              title="Combat Replay"
              subtitle={`Against ${combatPlaybackData.mobDisplayName}`}
              progressLabel={fightProgress && fightProgress.total > 1
                ? fightProgress.room
                  ? `Room ${fightProgress.room} • ${fightProgress.current}/${fightProgress.total}`
                  : `${fightProgress.current}/${fightProgress.total}`
                : undefined}
              className="mb-4"
            >
              {combatPlaybackData.log ? (
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
                  activeEvents={combatPlaybackData.activeEvents}
                  playerStartStamina={combatPlaybackData.playerStartStamina}
                  playerStartMana={combatPlaybackData.playerStartMana}
                  playerMaxStamina={staminaState?.max}
                  playerMaxMana={manaState?.max}
                  speedMs={combatSpeedMs}
                  autoSkip={autoSkipCombat}
                  onComplete={onCombatPlaybackComplete ?? (() => {})}
                  onSkip={() => {
                    onCombatPlaybackComplete?.();
                  }}
                />
              ) : (
                <div className="text-center py-8 text-[var(--rpg-text-secondary)]">
                  <div className="animate-pulse">Loading combat data...</div>
                </div>
              )}
            </PlaybackSurface>
          )}

          {/* Last Combat (detailed log — shown after playback completes) */}
          {!combatPlaybackData && lastCombat && (
            <div className={`bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-3 ${lastCombat.outcome === 'victory' ? 'rpg-victory-pulse' : ''}`}>
              {lastCombat.fights && lastCombat.fights.length > 1 && (
                <FightNavigationBar
                  currentIndex={lastCombatFightIndex}
                  total={lastCombat.fights.length}
                  onPrev={() => setLastCombatFightIndex(prev => prev - 1)}
                  onNext={() => setLastCombatFightIndex(prev => prev + 1)}
                />
              )}

              <button
                type="button"
                onClick={() => setLastCombatCollapsed(prev => !prev)}
                className="flex items-center justify-between w-full text-left"
                aria-expanded={!lastCombatCollapsed}
              >
                <div className="flex items-center gap-2 text-[var(--rpg-text-primary)] font-semibold">
                  <img
                    src={monsterImageSrc(displayedFight?.mobName ?? lastCombat.mobName)}
                    alt={displayedFight?.mobDisplayName ?? lastCombat.mobDisplayName}
                    className="w-8 h-8 rounded object-cover"
                  />
                  Last Combat: <span className="font-almendra">{displayedFight?.mobDisplayName ?? lastCombat.mobDisplayName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`text-sm font-semibold ${outcomeColor}`}>{outcomeLabel}</div>
                  <span className="text-[var(--rpg-text-secondary)] text-xs">
                    {lastCombatCollapsed ? '▶' : '▼'}
                  </span>
                </div>
              </button>

              {!lastCombatCollapsed && (
                <>
                  <div className="flex justify-end">
                    <CopyButton text={shareText} />
                  </div>

                  <div className="max-h-72 overflow-y-auto space-y-0.5 border-t border-[var(--rpg-border)] pt-2">
                    {displayedFight && displayedFight.log.length > 0 ? (
                      displayedFight.log.map((entry, idx) => (
                        <CombatLogEntry
                          key={idx}
                          entry={entry}
                          playerMaxHp={playerMaxHp}
                          mobMaxHp={mobMaxHp}
                          showDetailedBreakdown={isLastCombatMobDiscovered}
                        />
                      ))
                    ) : (
                      <div className="text-sm text-[var(--rpg-text-secondary)] py-2">
                        Combat log not available for this fight.
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[var(--rpg-border)] pt-2">
                    <CombatRewardsSummary
                      rewards={lastCombat.rewards}
                      outcome={lastCombat.outcome}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg p-3 space-y-3">
            <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Encounter Sites</h2>

            {combatXpRate && (
              <XpRateBadge skillName={combatXpRate.skillName} rate={combatXpRate.rate} />
            )}

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
                  const isDisabled = isOverEncumbered || hpState.isRecovering || busyAction === 'combat' || !e.nextMobTemplateId || isWrongZone || !!combatPlaybackData || isOffline;
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
                          <div className="flex items-center gap-1.5 flex-wrap text-[var(--rpg-text-primary)] font-semibold font-almendra">
                            {e.siteName}
                            <EventBadges inline modifiers={e.eventModifiers} />
                          </div>
                          <span className="text-xs text-[var(--rpg-text-secondary)]">
                            {e.totalRooms > 1
                              ? <>Room <span className="font-pixel text-[8px]">{e.currentRoom}/{e.totalRooms}</span> · <span className="font-pixel text-[8px]">{e.aliveMobs}/{e.totalMobs}</span> mobs</>
                              : <><span className="font-pixel text-[8px]">{e.aliveMobs}/{e.totalMobs}</span> mobs</>
                            }
                          </span>
                          <span className={`text-xs ${e.totalTurnCost > currentTurns ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-secondary)]'}`}>
                            {' · '}Cost: <span className="font-pixel text-[8px]">{e.totalTurnCost.toLocaleString()}</span> turns
                          </span>
                          {e.clearStrategy && (
                            <span className="text-xs text-[var(--rpg-gold)] ml-2">
                              {e.clearStrategy === 'full_clear' ? 'Full Clear' : 'Room by Room'}
                            </span>
                          )}
                          <div className="text-xs text-[var(--rpg-text-secondary)]">
                            Next monster: <span className="font-almendra">{nextMobLabel ?? 'None (site decayed)'}</span>
                          </div>
                        <div className="text-xs text-[var(--rpg-text-secondary)]">
                          Zone: <span className="font-almendra">{e.zoneName}</span> | Decayed <span className="font-pixel text-[8px]">{e.decayedMobs}</span> | Found{' '}
                          {relativeTime(pendingClockMs - new Date(e.discoveredAt).getTime())}
                        </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFightClick(e)}
                        disabled={isDisabled}
                        title={isOffline ? "You're offline" : undefined}
                        className={`px-3 py-2 rounded font-semibold ${
                          isDisabled
                            ? 'bg-[var(--rpg-border)] text-[var(--rpg-text-secondary)] cursor-not-allowed'
                            : 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                        }`}
                      >
                        {isOverEncumbered
                          ? 'Over-Encumbered'
                          : hpState.isRecovering
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
        </>
      ) : (
        <CombatHistory />
      )}
    </ScreenContainer>
  );
}

