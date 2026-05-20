'use client';

import { useEffect, useMemo, useState } from 'react';
import { trackEvent, trackOnce } from '@/lib/analytics';
import { COMBAT_CONSTANTS } from '@pocketrealm/shared';
import { KnockoutBanner } from '@/components/KnockoutBanner';
import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
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
import { getMobPrefixDefinition, HP_CONSTANTS, TUTORIAL_STEP_COMBAT } from '@pocketrealm/shared';
import type { HpState, LastCombat, LastCombatLogEntry, PendingEncounter } from '../gameController.types';
import type { RefreshPendingEncounterOptions } from '../hooks/useEncounterSites';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { SubNav } from '@/components/common/SubNav';
import { EncounterSiteCombatView } from '@/components/encounter/EncounterSiteCombatView';
import type { EncounterPlayerState } from '@/lib/api/combat';
import {
  autoResolveEncounterRoom,
  startEncounterRoom,
  resolveEncounterRound,
  abandonEncounterSite,
} from '@/lib/api/combat';
import { makeEncounterMobId } from '@pocketrealm/shared';
import type { CombatTemplateData, ExpeditionMobInfo, StateUpdates } from '@pocketrealm/shared';

interface CombatScreenProps {
  hpState: HpState;
  isOverEncumbered?: boolean;
  isActivityLocked?: boolean;
  activityLockReason?: 'encounter' | 'expedition' | null;
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
  // Encounter site combat
  templates?: CombatTemplateData[];
  onActivateTemplate?: (templateId: string) => void;
  onStateUpdates?: (updates: StateUpdates) => void;
  refreshPendingEncounters?: (options?: RefreshPendingEncounterOptions) => Promise<PendingEncounter[] | undefined>;
  setError?: (msg: string | null) => void;
  activeEncounterSiteId?: string | null;
  onActiveEncounterSiteIdChange?: (id: string | null) => void;
  advanceTutorial?: (step: number) => void;
}

export function CombatScreen({
  hpState,
  isOverEncumbered,
  isActivityLocked = false,
  activityLockReason,
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
  templates,
  onActivateTemplate,
  onStateUpdates,
  refreshPendingEncounters,
  setError,
  activeEncounterSiteId: externalActiveEncounterSiteId,
  onActiveEncounterSiteIdChange,
  advanceTutorial,
}: CombatScreenProps) {
  const [activeView, setActiveView] = useState<'encounters' | 'history' | 'bossHistory'>('encounters');
  const [lowHpPendingSite, setLowHpPendingSite] = useState<PendingEncounter | null>(null);
  const [lastCombatFightIndex, setLastCombatFightIndex] = useState(0);
  const [lastCombatCollapsed, setLastCombatCollapsed] = useState(false);

  // Encounter site room combat state
  const [activeSiteCombat, setActiveSiteCombat] = useState<{
    siteId: string;
    siteName: string;
    mobFamilyName: string;
    currentRoom: number;
    totalRooms: number;
    hasDecayedMobs: boolean;
    mobs: ExpeditionMobInfo[];
    resumeSession?: boolean;
  } | null>(null);

  // Sync with external activeEncounterSiteId on mount (reconnect)
  useEffect(() => {
    if (externalActiveEncounterSiteId && !activeSiteCombat) {
      const site = pendingEncounters.find(e => e.encounterSiteId === externalActiveEncounterSiteId);
      if (site) {
        enterEncounterCombat(site, { resumeSession: true });
      }
    }
  }, [externalActiveEncounterSiteId, pendingEncounters]);

  useEffect(() => {
    setLastCombatFightIndex(lastCombat?.fights ? lastCombat.fights.length - 1 : 0);
    setLastCombatCollapsed(false);
  }, [lastCombat]);

  const buildActiveSiteCombat = (site: PendingEncounter, opts?: { resumeSession?: boolean }) => ({
    siteId: site.encounterSiteId,
    siteName: site.siteName,
    mobFamilyName: site.mobFamilyName,
    currentRoom: site.currentRoom,
    totalRooms: site.totalRooms,
    hasDecayedMobs: site.decayedMobs > 0,
    mobs: (site.currentRoomMobs ?? []).map(m => ({
      id: makeEncounterMobId(m.slot),
      name: m.name,
      prefix: m.prefix,
      hp: m.hp,
      maxHp: m.maxHp,
      activeEffects: [],
    })),
    resumeSession: opts?.resumeSession,
  });

  const displayedFight = lastCombat?.fights?.[lastCombatFightIndex] ?? lastCombat;

  const enterEncounterCombat = (site: PendingEncounter, opts?: { resumeSession?: boolean }) => {
    setActiveSiteCombat(buildActiveSiteCombat(site, opts));
  };

  const handleFightClick = (site: PendingEncounter) => {
    if (
      lowHpWarning &&
      hpState.maxHp > 0 &&
      (hpState.currentHp / hpState.maxHp) < HP_CONSTANTS.LOW_HP_WARNING_THRESHOLD
    ) {
      setLowHpPendingSite(site);
      return;
    }
    enterEncounterCombat(site);
  };

  const proceedWithFight = (site: PendingEncounter) => {
    setLowHpPendingSite(null);
    enterEncounterCombat(site);
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
      {/* Strategy Selection Modal — removed, strategy is chosen per-room in combat view */}

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

      {/* Activity Lock Banner — only shown for expedition locks; encounter site locks don't block this screen */}
      {isActivityLocked && activityLockReason === 'expedition' && !hpState.isRecovering && !combatPlaybackData && (
        <KnockoutBanner
          title="Active Expedition"
          action="fighting encounter sites"
          message="You are on an active expedition. Complete it before starting combat."
        />
      )}

      {/* Resource Status — hidden during encounter site combat (it has its own per-round bar) */}
      {!combatPlaybackData && !hpState.isRecovering && !activeSiteCombat && (
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
        activeSiteCombat ? (
          <EncounterSiteCombatView
            siteId={activeSiteCombat.siteId}
            siteName={activeSiteCombat.siteName}
            mobFamilyName={activeSiteCombat.mobFamilyName}
            currentRoom={activeSiteCombat.currentRoom}
            totalRooms={activeSiteCombat.totalRooms}
            initialMobs={activeSiteCombat.mobs}
            playerState={{
              hp: hpState.currentHp,
              maxHp: hpState.maxHp,
              stamina: staminaState?.current ?? 0,
              maxStamina: staminaState?.max ?? 0,
              mana: manaState?.current ?? 0,
              maxMana: manaState?.max ?? 0,
              activeEffects: [],
            }}
            templates={templates ?? []}
            hasDecayedMobs={activeSiteCombat.hasDecayedMobs}
            onAutoResolve={async () => {
              const result = await autoResolveEncounterRoom(activeSiteCombat.siteId);
              if (result.stateUpdates) onStateUpdates?.(result.stateUpdates);
              return result;
            }}
            onStartRoom={async () => {
              const result = await startEncounterRoom(activeSiteCombat.siteId);
              onActiveEncounterSiteIdChange?.(activeSiteCombat.siteId);
              if (result.stateUpdates) onStateUpdates?.(result.stateUpdates);
              return result;
            }}
            onResolveRound={async (action) => {
              const result = await resolveEncounterRound(activeSiteCombat.siteId, action);
              if (result.stateUpdates) onStateUpdates?.(result.stateUpdates);
              return result;
            }}
            onAbandon={async () => {
              const result = await abandonEncounterSite(activeSiteCombat.siteId);
              if (result.stateUpdates) onStateUpdates?.(result.stateUpdates);
              setActiveSiteCombat(null);
            }}
            onAdvanceRoom={async () => {
              onActiveEncounterSiteIdChange?.(null);
              const refreshedSites = await refreshPendingEncounters?.({ includeEncounterSiteId: activeSiteCombat.siteId });
              const refreshedSite = refreshedSites?.find((site) => site.encounterSiteId === activeSiteCombat.siteId);
              if (!refreshedSite) {
                throw new Error('Encounter site is no longer available');
              }
              const nextCombatState = buildActiveSiteCombat(refreshedSite);
              setActiveSiteCombat(nextCombatState);
              return {
                currentRoom: refreshedSite.currentRoom,
                mobs: nextCombatState.mobs,
                playerState: {
                  hp: hpState.currentHp,
                  maxHp: hpState.maxHp,
                  stamina: staminaState?.current ?? 0,
                  maxStamina: staminaState?.max ?? 0,
                  mana: manaState?.current ?? 0,
                  maxMana: manaState?.max ?? 0,
                  activeEffects: [],
                },
                hasDecayedMobs: refreshedSite.decayedMobs > 0,
              };
            }}
            onComplete={(combatOutcome) => {
              // Analytics: track combat action
              const zone = currentZoneId ?? '';
              trackEvent('action', { type: 'combat', turns: COMBAT_CONSTANTS.ENCOUNTER_TURN_COST, zone });
              trackOnce('first_combat', { zone });
              if (combatOutcome === 'defeated') {
                trackEvent('death', { zone, mob: activeSiteCombat.mobFamilyName });
              }

              setActiveSiteCombat(null);
              onActiveEncounterSiteIdChange?.(null);
              refreshPendingEncounters?.();
              if (combatOutcome === 'cleared') {
                advanceTutorial?.(TUTORIAL_STEP_COMBAT);
              }
            }}
            onActivateTemplate={onActivateTemplate ?? (() => {})}
            setError={setError ?? (() => {})}
            resumeSession={activeSiteCombat.resumeSession}
          />
        ) : (
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
                  const isExpeditionLocked = isActivityLocked && activityLockReason === 'expedition';
                  const isDisabled = isOverEncumbered || hpState.isRecovering || isExpeditionLocked || busyAction === 'combat' || !e.nextMobTemplateId || isWrongZone || !!combatPlaybackData || isOffline;
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
                        {isExpeditionLocked
                          ? 'In Expedition'
                          : isOverEncumbered
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
        )
      ) : (
        <CombatHistory />
      )}
    </ScreenContainer>
  );
}

