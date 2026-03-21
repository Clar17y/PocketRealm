'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExpeditionContext } from '@/lib/assets';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  getActiveExpedition,
  getExpeditionStatus,
  getExpeditionHistory,
  launchExpedition,
  signUpForExpedition,
  forceStartExpedition,
  forceNextRound,
  autoResolveRoom,
  recoverFromExpeditionKO,
  setExpeditionTarget,
  setExpeditionHealTarget,
  abandonExpedition,
  getExpeditionCooldowns,
} from '@/lib/api/expedition';
import { getTemplates, activateTemplate } from '@/lib/api/templates';
import type {
  ExpeditionDetailResponse,
} from '@/lib/api/expedition';
import type {
  ExpeditionAttemptLog,
  ExpeditionData,
  ExpeditionMemberData,
  ExpeditionRoundLog,
  ExpeditionCooldownInfo,
  CombatTemplateData,
  StateUpdates,
} from '@pocketrealm/shared';
import { EXPEDITION_CONSTANTS, EXPEDITION_THEMES } from '@pocketrealm/shared';
import { formatNumber, formatTimeRemaining } from '@/lib/format';
import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
import { ContributionList } from '@/components/common/ContributionList';
import {
  EffectPill, roomTypeBadge,
  RoomProgressBar, MobCardGrid, CombatRoundLog, TemplateQuickSwitch,
  RoundLogContent, ThreatMeter,
} from '@/components/common/combat';

// ---------------------------------------------------------------------------
// Tier definitions — derived from shared constants
// ---------------------------------------------------------------------------

const TIER_CONFIGS = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER.map((levelReq, i) => {
  const tier = i + 1;
  const themeNames = EXPEDITION_THEMES
    .filter(t => t.tier === tier)
    .map(t => t.name);
  return {
    tier,
    themeNames,
    levelReq,
    treasuryCost: EXPEDITION_CONSTANTS.TREASURY_COST_BY_TIER[i],
    minParticipants: EXPEDITION_CONSTANTS.MIN_PARTICIPANTS_BY_TIER[i],
    totalRooms: EXPEDITION_CONSTANTS.ROOMS_BY_TIER[i],
  };
});

// ---------------------------------------------------------------------------
// Attempt Badge
// ---------------------------------------------------------------------------

function AttemptBadge({ attemptNumber }: { attemptNumber: number }) {
  if (attemptNumber <= 1) return null;
  return (
    <span className="text-xs text-[var(--rpg-text-secondary)]">
      Attempt {attemptNumber}/{EXPEDITION_CONSTANTS.MAX_ATTEMPTS}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GuildExpeditionsTabProps {
  guildId: string;
  playerId: string | null;
  myRole: 'leader' | 'officer' | 'member';
  characterLevel: number;
  setError: (msg: string | null) => void;
  onStateUpdates?: (updates: StateUpdates) => void;
  onRefresh?: () => void;
  onExpeditionContextChange?: (ctx: ExpeditionContext | null) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function Countdown({ expiresAt, onExpired }: { expiresAt: string | null; onExpired?: () => void }) {
  const [remaining, setRemaining] = useState('');
  const firedRef = useRef(false);
  const onExpiredRef = useRef(onExpired);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    if (!expiresAt) return;
    const expiresAtMs = new Date(expiresAt).getTime();

    // Only reset the fired guard if the new expiry is in the future.
    if (expiresAtMs > Date.now()) {
      firedRef.current = false;
    }

    const tick = () => {
      const ms = expiresAtMs - Date.now();
      if (ms <= 0 && !firedRef.current) {
        firedRef.current = true;
        onExpiredRef.current?.();
      }
      setRemaining(formatTimeRemaining(expiresAt));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  return <span className="text-xs text-[var(--rpg-text-secondary)]">{remaining}</span>;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GuildExpeditionsTab({
  guildId,
  playerId,
  myRole,
  characterLevel,
  setError,
  onStateUpdates,
  onRefresh,
  onExpeditionContextChange,
}: GuildExpeditionsTabProps) {
  const [subTab, setSubTab] = useState<'active' | 'history'>('active');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [expedition, setExpedition] = useState<ExpeditionData | null>(null);
  const [members, setMembers] = useState<ExpeditionMemberData[]>([]);
  const [cooldowns, setCooldowns] = useState<ExpeditionCooldownInfo | null>(null);
  const [templates, setTemplates] = useState<CombatTemplateData[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { type: 'launch'; tier: number }
    | { type: 'forceStart' }
    | { type: 'autoResolve' }
    | { type: 'abandon' }
    | null
  >(null);

  const isOfficer = myRole === 'leader' || myRole === 'officer';

  // Propagate expedition background context to parent for screen backgrounds
  const expThemeId = expedition?.status === 'in_progress' ? expedition.themeId : null;
  const expIsBossRoom = expedition?.currentRoomType === 'final_boss';
  useEffect(() => {
    if (!onExpeditionContextChange) return;
    if (expThemeId) {
      onExpeditionContextChange({ theme: expThemeId, isBossRoom: expIsBossRoom });
    } else {
      onExpeditionContextChange(null);
    }
  }, [expThemeId, expIsBossRoom, onExpeditionContextChange]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await getTemplates();
      if (res.data) setTemplates(res.data.templates);
    } catch { /* ignore */ }
  }, []);

  const loadExpedition = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLoading(true);
    }
    try {
      const res = await getActiveExpedition();
      if (res.error) { setError(res.error.message); return; }
      if (res.data?.expedition) {
        const detail = await getExpeditionStatus(res.data.expedition.id);
        if (detail.data) {
          setExpedition(detail.data.expedition);
          setMembers(detail.data.members);
        } else {
          setExpedition(res.data.expedition);
        }
      } else {
        setExpedition(null);
        setMembers([]);
      }
      // Fetch cooldowns when no active expedition (for IdleView)
      if (!res.data?.expedition) {
        try {
          const cdRes = await getExpeditionCooldowns();
          if (cdRes.data) setCooldowns(cdRes.data);
        } catch { /* ignore cooldown fetch errors */ }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load expedition');
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  }, [setError]);

  useEffect(() => { void loadExpedition(true); void loadTemplates(); }, [loadExpedition, loadTemplates]);

  const handleActivateTemplate = useCallback(async (templateId: string) => {
    try {
      await activateTemplate(templateId);
      await loadTemplates();
    } catch { /* ignore */ }
  }, [loadTemplates]);

  // Auto-refresh every 30s when expedition is active
  useEffect(() => {
    if (!expedition || expedition.status === 'completed' || expedition.status === 'failed') return;
    const interval = setInterval(() => void loadExpedition(), 30_000);
    return () => clearInterval(interval);
  }, [expedition?.status, loadExpedition]);

  const requestLaunch = (tier: number) => {
    setPendingConfirm({ type: 'launch', tier });
  };

  const handleLaunch = async (tier: number) => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await launchExpedition(tier);
      if (res.error) { setError(res.error.message); return; }
      void loadExpedition();
      onRefresh?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to launch expedition');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!expedition) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await signUpForExpedition(expedition.id);
      if (res.error) { setError(res.error.message); return; }
      if (res.data?.stateUpdates) onStateUpdates?.(res.data.stateUpdates);
      void loadExpedition();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign up');
    } finally {
      setActionLoading(false);
    }
  };

  const requestForceStart = () => {
    setPendingConfirm({ type: 'forceStart' });
  };

  const handleForceStart = async () => {
    if (!expedition) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await forceStartExpedition(expedition.id);
      if (res.error) { setError(res.error.message); return; }
      void loadExpedition();
      onRefresh?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to force start');
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceRound = async () => {
    if (!expedition) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await forceNextRound(expedition.id);
      if (res.error) { setError(res.error.message); return; }
      void loadExpedition();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to force round');
    } finally {
      setActionLoading(false);
    }
  };

  const requestAutoResolve = () => {
    setPendingConfirm({ type: 'autoResolve' });
  };

  const handleAutoResolve = async () => {
    if (!expedition) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await autoResolveRoom(expedition.id);
      if (res.error) { setError(res.error.message); return; }
      void loadExpedition();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to auto-resolve');
    } finally {
      setActionLoading(false);
    }
  };

  // Auto-advance: fires force-round every 10s when toggled on
  const [autoAdvance, setAutoAdvance] = useState(false);
  const autoAdvanceRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roundInFlightRef = useRef(false);

  useEffect(() => {
    if (autoAdvance && expedition?.status === 'in_progress') {
      autoAdvanceRef.current = setInterval(async () => {
        if (roundInFlightRef.current) return;
        roundInFlightRef.current = true;
        try {
          await forceNextRound(expedition.id);
          await loadExpedition();
        } finally {
          roundInFlightRef.current = false;
        }
      }, 10_000);
    }
    return () => {
      if (autoAdvanceRef.current) {
        clearInterval(autoAdvanceRef.current);
        autoAdvanceRef.current = null;
      }
    };
  }, [autoAdvance, expedition?.id, expedition?.status, loadExpedition]);

  const handleRecover = async () => {
    if (!expedition) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await recoverFromExpeditionKO(expedition.id);
      if (res.error) { setError(res.error.message); return; }
      if (res.data?.stateUpdates) onStateUpdates?.(res.data.stateUpdates);
      void loadExpedition();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to recover');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetTarget = async (targetMobId: string | null) => {
    if (!expedition) return;
    setError(null);
    try {
      const res = await setExpeditionTarget(expedition.id, targetMobId);
      if (res.error) { setError(res.error.message); return; }
      void loadExpedition();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set target');
    }
  };

  const handleSetHealTarget = async (healTargetPlayerId: string | null) => {
    if (!expedition) return;
    setError(null);
    try {
      const res = await setExpeditionHealTarget(expedition.id, healTargetPlayerId);
      if (res.error) { setError(res.error.message); return; }
      void loadExpedition();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to set heal target');
    }
  };

  const requestAbandon = () => {
    setPendingConfirm({ type: 'abandon' });
  };

  const handleAbandon = async () => {
    if (!expedition) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await abandonExpedition(expedition.id);
      if (res.error) { setError(res.error.message); return; }
      void loadExpedition();
      onRefresh?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to abandon expedition');
    } finally {
      setActionLoading(false);
    }
  };

  const tabBar = (
    <div className="flex gap-1 mb-3">
      <button
        onClick={() => setSubTab('active')}
        className={`px-3 py-1 text-xs rounded ${subTab === 'active' ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'}`}
      >
        Active
      </button>
      <button
        onClick={() => setSubTab('history')}
        className={`px-3 py-1 text-xs rounded ${subTab === 'history' ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'}`}
      >
        History
      </button>
    </div>
  );

  const confirmModalConfig: Record<'launch' | 'forceStart' | 'autoResolve' | 'abandon', { title: string; message: string; confirmLabel: string; variant: 'danger' | 'warning' }> = {
    launch: {
      title: 'Launch Expedition?',
      message: pendingConfirm?.type === 'launch'
        ? `Launch Tier ${pendingConfirm.tier} expedition? Treasury will be deducted immediately.`
        : '',
      confirmLabel: 'Launch',
      variant: 'warning',
    },
    forceStart: {
      title: 'Force Start?',
      message: 'Force start the expedition now? The signup window will end immediately.',
      confirmLabel: 'Force Start',
      variant: 'warning',
    },
    autoResolve: {
      title: 'Auto-Resolve Room?',
      message: 'Auto-resolve this room? Templates are locked and all rounds resolve instantly.',
      confirmLabel: 'Auto-Resolve',
      variant: 'warning',
    },
    abandon: {
      title: 'Abandon Expedition?',
      message: 'Abandon this expedition? This will end the expedition and trigger a cooldown.',
      confirmLabel: 'Abandon',
      variant: 'danger',
    },
  };

  const confirmModal = pendingConfirm && (
    <ConfirmModal
      title={confirmModalConfig[pendingConfirm.type].title}
      message={confirmModalConfig[pendingConfirm.type].message}
      confirmLabel={confirmModalConfig[pendingConfirm.type].confirmLabel}
      variant={confirmModalConfig[pendingConfirm.type].variant}
      onConfirm={() => {
        const action = pendingConfirm;
        setPendingConfirm(null);
        switch (action.type) {
          case 'launch': void handleLaunch(action.tier); break;
          case 'forceStart': void handleForceStart(); break;
          case 'autoResolve': void handleAutoResolve(); break;
          case 'abandon': void handleAbandon(); break;
        }
      }}
      onCancel={() => setPendingConfirm(null)}
    />
  );

  if (subTab === 'history') {
    return (
      <>
        {tabBar}
        <HistoryView guildId={guildId} playerId={playerId} />
        {confirmModal}
      </>
    );
  }

  // Active tab
  if (loading) return <>{tabBar}<SkeletonCard count={2} /></>;

  if (!expedition) {
    return (
      <>
        {tabBar}
        <IdleView isOfficer={isOfficer} characterLevel={characterLevel} actionLoading={actionLoading} onLaunch={requestLaunch} cooldowns={cooldowns} />
        {confirmModal}
      </>
    );
  }

  const activeContent = (() => {
    switch (expedition.status) {
      case 'recruiting':
        return (
          <RecruitingView
            expedition={expedition}
            members={members}
            playerId={playerId}
            characterLevel={characterLevel}
            actionLoading={actionLoading}
            isOfficer={isOfficer}
            onSignup={handleSignup}
            onForceStart={requestForceStart}
            onAbandon={requestAbandon}
            onExpired={loadExpedition}
          />
        );
      case 'in_progress':
        return (
          <InProgressView
            expedition={expedition}
            members={members}
            playerId={playerId}
            actionLoading={actionLoading}
            isOfficer={isOfficer}
            onRecover={handleRecover}
            onForceRound={handleForceRound}
            onAutoResolve={requestAutoResolve}
            autoAdvance={autoAdvance}
            onToggleAutoAdvance={() => setAutoAdvance(prev => !prev)}
            onSetTarget={handleSetTarget}
            onSetHealTarget={handleSetHealTarget}
            onAbandon={requestAbandon}
            onRefresh={loadExpedition}
            onExpired={loadExpedition}
            templates={templates}
            onActivateTemplate={handleActivateTemplate}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <>
      {tabBar}
      {activeContent}
      {confirmModal}
    </>
  );
}

// ---------------------------------------------------------------------------
// Idle View — No Active Expedition
// ---------------------------------------------------------------------------

function IdleView({
  isOfficer,
  characterLevel,
  actionLoading,
  onLaunch,
  cooldowns,
}: {
  isOfficer: boolean;
  characterLevel: number;
  actionLoading: boolean;
  onLaunch: (tier: number) => void;
  cooldowns: ExpeditionCooldownInfo | null;
}) {
  // Determine cooldown reason per tier (null cooldowns = still loading, disable buttons)
  function getCooldownReason(tier: number): string | null {
    if (!cooldowns) return 'Loading...';
    if (cooldowns.hasActiveExpedition) return 'Expedition active';
    const weeklyExpiry = cooldowns.weeklyCooldowns?.[tier];
    if (weeklyExpiry && new Date(weeklyExpiry).getTime() > Date.now()) {
      return `Weekly: ${formatTimeRemaining(weeklyExpiry)}`;
    }
    if (cooldowns.betweenCooldown && new Date(cooldowns.betweenCooldown).getTime() > Date.now()) {
      return `Cooldown: ${formatTimeRemaining(cooldowns.betweenCooldown)}`;
    }
    return null;
  }

  return (
    <div className="space-y-3">
      <PixelCard>
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)] mb-1">Expeditions</h3>
        <p className="text-xs text-[var(--rpg-text-secondary)]">
          Embark on multi-room dungeon raids with your guild. Each launch selects a random dungeon theme with unique enemies and bosses. Clear rooms, defeat bosses, and earn expedition tokens for powerful gear.
        </p>
      </PixelCard>

      {isOfficer ? (
        <div className="space-y-2">
          {TIER_CONFIGS.map((cfg) => {
            const hasThemes = EXPEDITION_THEMES.some(t => t.tier === cfg.tier);
            const levelTooLow = characterLevel < cfg.levelReq;
            const cooldownReason = getCooldownReason(cfg.tier);
            const isDisabled = actionLoading || levelTooLow || !!cooldownReason || !hasThemes;
            return (
              <PixelCard key={cfg.tier}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
                      Tier {cfg.tier} Expedition
                    </p>
                    {cfg.themeNames.length > 0 && (
                      <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-0.5">
                        Random dungeon: {cfg.themeNames.join(', ')}
                      </p>
                    )}
                    <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
                      <span className="text-[var(--rpg-text-secondary)]">Level Req:</span>
                      <span className={levelTooLow ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-primary)]'}>
                        {cfg.levelReq}
                      </span>
                      <span className="text-[var(--rpg-text-secondary)]">Treasury Cost:</span>
                      <span className="text-[var(--rpg-gold)]">{formatNumber(cfg.treasuryCost)}</span>
                      <span className="text-[var(--rpg-text-secondary)]">Min Players:</span>
                      <span className="text-[var(--rpg-text-primary)]">{cfg.minParticipants}</span>
                      <span className="text-[var(--rpg-text-secondary)]">Rooms:</span>
                      <span className="text-[var(--rpg-text-primary)]">{cfg.totalRooms}</span>
                    </div>
                    {cooldownReason && (
                      <p className="mt-1 text-[10px] text-[var(--rpg-gold)]">{cooldownReason}</p>
                    )}
                  </div>
                  <PixelButton
                    size="sm"
                    onClick={() => onLaunch(cfg.tier)}
                    disabled={isDisabled}
                  >
                    {hasThemes ? 'Launch' : 'Coming Soon'}
                  </PixelButton>
                </div>
              </PixelCard>
            );
          })}
        </div>
      ) : (
        <PixelCard>
          <p className="text-xs text-[var(--rpg-text-secondary)] italic">
            Only officers and the guild leader can launch expeditions.
          </p>
        </PixelCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recruiting View
// ---------------------------------------------------------------------------

function RecruitingView({
  expedition,
  members,
  playerId,
  characterLevel,
  actionLoading,
  isOfficer,
  onSignup,
  onForceStart,
  onAbandon,
  onExpired,
}: {
  expedition: ExpeditionData;
  members: ExpeditionMemberData[];
  playerId: string | null;
  characterLevel: number;
  actionLoading: boolean;
  isOfficer: boolean;
  onSignup: () => void;
  onForceStart: () => void;
  onAbandon: () => void;
  onExpired: () => void;
}) {
  const tierCfg = TIER_CONFIGS.find((c) => c.tier === expedition.tier);
  const meetsLevel = tierCfg ? characterLevel >= tierCfg.levelReq : true;
  const alreadySignedUp = members.some(m => m.playerId === playerId);

  return (
    <div className="space-y-3">
      <PixelCard>
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-sm font-bold text-[var(--rpg-gold)]">
              Tier {expedition.tier} Expedition — Recruiting
            </p>
            {expedition.themeName && (
              <p className="text-xs text-[var(--rpg-text-secondary)]">{expedition.themeName}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]">
              Recruiting
            </span>
            <AttemptBadge attemptNumber={expedition.attemptNumber} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mb-3">
          <span className="text-[var(--rpg-text-secondary)]">Participants:</span>
          <span className="text-[var(--rpg-text-primary)]">
            {expedition.participantCount} / {tierCfg?.minParticipants ?? '?'}
          </span>
          <span className="text-[var(--rpg-text-secondary)]">Rooms:</span>
          <span className="text-[var(--rpg-text-primary)]">{expedition.totalRooms}</span>
          <span className="text-[var(--rpg-text-secondary)]">Starts In:</span>
          <Countdown expiresAt={expedition.nextRoundAt} onExpired={onExpired} />
        </div>

        <div className="flex gap-2">
          <PixelButton
            size="sm"
            onClick={onSignup}
            disabled={actionLoading || !meetsLevel || alreadySignedUp}
          >
            {alreadySignedUp
              ? 'Signed Up'
              : !meetsLevel
                ? `Level ${tierCfg?.levelReq} Required`
                : actionLoading
                  ? 'Signing up...'
                  : 'Sign Up'}
          </PixelButton>
          {isOfficer && members.length > 0 && (
            <PixelButton
              size="sm"
              variant="danger"
              onClick={onForceStart}
              disabled={actionLoading}
            >
              Force Start
            </PixelButton>
          )}
          {isOfficer && (
            <PixelButton size="sm" variant="danger" onClick={onAbandon} disabled={actionLoading}>
              Abandon
            </PixelButton>
          )}
        </div>
      </PixelCard>

      {members.length > 0 && (
        <MemberList members={members} />
      )}

      {expedition.attemptLogs.length > 0 && (
        <PreviousAttemptsSection attemptLogs={expedition.attemptLogs} playerId={playerId} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// In-Progress View
// ---------------------------------------------------------------------------

function InProgressView({
  expedition,
  members,
  playerId,
  actionLoading,
  isOfficer,
  onRecover,
  onForceRound,
  onAutoResolve,
  autoAdvance,
  onToggleAutoAdvance,
  onSetTarget,
  onSetHealTarget,
  onAbandon,
  onRefresh,
  onExpired,
  templates,
  onActivateTemplate,
}: {
  expedition: ExpeditionData;
  members: ExpeditionMemberData[];
  playerId: string | null;
  actionLoading: boolean;
  isOfficer: boolean;
  onRecover: () => void;
  onForceRound: () => void;
  onAutoResolve: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  onSetTarget: (targetMobId: string | null) => void;
  onSetHealTarget: (healTargetPlayerId: string | null) => void;
  onAbandon: () => void;
  onRefresh: () => void;
  onExpired: () => void;
  templates: CombatTemplateData[];
  onActivateTemplate: (templateId: string) => void;
}) {
  const roomBadge = roomTypeBadge(expedition.currentRoomType);

  const isResting = expedition.currentRoomType === null && expedition.status === 'in_progress';
  const isBetweenRooms = expedition.roundNumber === 0;
  const myMember = members.find(m => m.playerId === playerId);
  const myTargetMobId = myMember?.targetMobId ?? null;
  const amKnockedOut = myMember?.isKnockedOut ?? false;

  // Count how many players target each mob
  const targetCounts = new Map<string, number>();
  for (const m of members) {
    if (m.targetMobId) {
      targetCounts.set(m.targetMobId, (targetCounts.get(m.targetMobId) ?? 0) + 1);
    }
  }

  return (
    <div className="space-y-3">
      <PixelCard>
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="text-sm font-bold text-[var(--rpg-gold)]">
              {expedition.themeName ?? `Tier ${expedition.tier} Expedition`}
            </p>
            {isResting ? (
              <p className="text-xs text-[var(--rpg-green-light)]">Resting...</p>
            ) : (
              <p className="text-xs" style={{ color: roomBadge.color }}>{roomBadge.label}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
              In Progress
            </span>
            <AttemptBadge attemptNumber={expedition.attemptNumber} />
          </div>
        </div>

        {/* Room progress bar */}
        <div className="mb-3">
          <RoomProgressBar currentRoom={expedition.currentRoom} totalRooms={expedition.totalRooms} zeroIndexed />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-[var(--rpg-text-secondary)]">Mobs Remaining:</span>
          <span className="text-[var(--rpg-text-primary)]">{expedition.mobsRemaining}</span>
          <span className="text-[var(--rpg-text-secondary)]">Round:</span>
          <span className="text-[var(--rpg-text-primary)]">{expedition.roundNumber}</span>
          <span className="text-[var(--rpg-text-secondary)]">Next Round:</span>
          <Countdown expiresAt={expedition.nextRoundAt} onExpired={onExpired} />
        </div>

        <div className="mt-3 pt-2 border-t border-[var(--rpg-border)] flex gap-2 items-start">
          <PixelButton size="sm" onClick={onRefresh}>
            Refresh
          </PixelButton>
          {isOfficer && expedition.roundNumber === 0 && expedition.nextRoundAt && (
            <div>
              <PixelButton
                size="sm"
                onClick={onAutoResolve}
                disabled={actionLoading}
              >
                {actionLoading ? 'Resolving...' : 'Auto-Resolve'}
              </PixelButton>
              <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-1">
                Instant clear — templates locked
              </p>
            </div>
          )}
          {isOfficer && expedition.nextRoundAt && (
            <div>
              <PixelButton
                size="sm"
                variant="danger"
                onClick={onForceRound}
                disabled={actionLoading}
              >
                {actionLoading ? 'Resolving...' : 'Force Next Round'}
              </PixelButton>
              <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-1">
                Skip wait — resolve next round now
              </p>
            </div>
          )}
          {isOfficer && expedition.roundNumber > 0 && (
            <div>
              <PixelButton
                size="sm"
                variant={autoAdvance ? 'primary' : 'secondary'}
                onClick={onToggleAutoAdvance}
              >
                {autoAdvance ? 'Auto: ON (10s)' : 'Auto: OFF'}
              </PixelButton>
              <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-1">
                Auto-fire rounds every 10s
              </p>
            </div>
          )}
          {isOfficer && (
            <PixelButton size="sm" variant="danger" onClick={onAbandon} disabled={actionLoading}>
              Abandon
            </PixelButton>
          )}
        </div>
      </PixelCard>

      {/* Template quick-switch */}
      {myMember && (
        <TemplateQuickSwitch
          templates={templates}
          activeTemplateId={templates.find(t => t.isActive)?.id ?? null}
          onActivate={onActivateTemplate}
        />
      )}

      {/* Current Room Mobs */}
      <MobCardGrid
        mobs={expedition.currentRoomMobs}
        myTargetMobId={myTargetMobId}
        targetCounts={targetCounts}
        onSetTarget={onSetTarget}
        disabled={amKnockedOut}
      />

      {/* Round Logs */}
      <CombatRoundLog
        roundLogs={expedition.roundLogs}
        playerId={playerId}
        multiRoom={expedition.roundLogs.some(l => l.roomIndex !== expedition.roundLogs[0]?.roomIndex)}
      />

      {/* Member status */}
      <MemberList
        members={members}
        playerId={playerId}
        showResources
        actionLoading={actionLoading}
        onRecover={isBetweenRooms ? onRecover : undefined}
        onSetHealTarget={onSetHealTarget}
        myHealTargetPlayerId={myMember?.healTargetPlayerId ?? null}
        amKnockedOut={amKnockedOut}
      />

      {/* Previous Attempt Logs (from wipes) */}
      {expedition.attemptLogs.length > 0 && (
        <PreviousAttemptsSection attemptLogs={expedition.attemptLogs} playerId={playerId} />
      )}
    </div>
  );
}

// (RoundLogContent, LatestRoundLog, PreviousRoundsLog extracted to @/components/common/combat)

// ---------------------------------------------------------------------------
// Round Log Display (used by history view)
// ---------------------------------------------------------------------------

function RoundLogList({ logs, playerId }: { logs: ExpeditionRoundLog[]; playerId: string | null }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Auto-expand latest log entry
  const latestIdx = logs.length > 0 ? logs.length - 1 : null;
  const effectiveExpanded = expandedKey ?? (latestIdx !== null ? String(latestIdx) : null);

  // Reverse with original indices for stable keys
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
// History View
// ---------------------------------------------------------------------------

function HistoryView({ guildId, playerId }: { guildId: string; playerId: string | null }) {
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

      {/* Pagination */}
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

// ---------------------------------------------------------------------------
// Previous Attempts Section (shown during active expeditions after wipes)
// ---------------------------------------------------------------------------

function PreviousAttemptsSection({
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
// History Detail Panel — Per-Attempt View
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
      {/* Attempt tabs (only if multiple attempts) */}
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

          {/* Per-attempt contributions */}
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
          {/* Fallback for old expeditions without attempt logs */}
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
// Member List
// ---------------------------------------------------------------------------

// (ThreatMeter extracted to @/components/common/combat)

function MemberList({
  members,
  playerId,
  showResources,
  actionLoading,
  onRecover,
  onSetHealTarget,
  myHealTargetPlayerId,
  amKnockedOut,
}: {
  members: ExpeditionMemberData[];
  playerId?: string | null;
  showResources?: boolean;
  actionLoading?: boolean;
  onRecover?: () => void;
  onSetHealTarget?: (playerId: string | null) => void;
  myHealTargetPlayerId?: string | null;
  amKnockedOut?: boolean;
}) {
  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => b.totalDamage - a.totalDamage),
    [members],
  );

  if (members.length === 0) return null;

  const canHealTarget = showResources && onSetHealTarget && !amKnockedOut;

  return (
    <PixelCard>
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-xs font-bold text-[var(--rpg-text-primary)]">Participants ({members.length})</h4>
        {canHealTarget && myHealTargetPlayerId && (
          <button
            onClick={() => onSetHealTarget(null)}
            className="text-[10px] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] underline"
          >
            Clear Heal Target
          </button>
        )}
      </div>
      {/* Threat Meter — only show during active combat (showResources) when anyone has threat */}
      {showResources && members.some((m) => m.threatValue > 0) && (
        <ThreatMeter
          entries={members
            .filter(m => !m.isKnockedOut && m.threatValue > 0)
            .map(m => ({
              id: m.playerId,
              label: m.username ?? m.playerId.slice(0, 8),
              threatValue: m.threatValue,
            }))}
        />
      )}

      <div className="space-y-2">
        {members.map((m) => {
          const isMyHealTarget = myHealTargetPlayerId === m.playerId;
          const memberRow = (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs text-[var(--rpg-text-primary)] truncate">
                  {m.username ?? m.playerId.slice(0, 8)}
                </span>
                {isMyHealTarget && (
                  <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]">
                    HEAL TARGET
                  </span>
                )}
              </div>
              {m.activeEffects?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {m.activeEffects.map((eff, idx) => (
                    <EffectPill key={idx} effect={eff} />
                  ))}
                </div>
              )}
              {showResources && (
                <ResourceStatusBar
                  currentHp={m.currentHp}
                  maxHp={m.maxHp}
                  currentStamina={m.currentStamina}
                  maxStamina={m.maxStamina}
                  currentMana={m.currentMana}
                  maxMana={m.maxMana}
                  isRecovering={m.isKnockedOut}
                  compact
                />
              )}
            </div>
          );

          return (
            <div
              key={m.playerId}
              className={`flex items-center gap-2 ${
                canHealTarget
                  ? `rounded border p-1.5 transition-colors cursor-pointer ${
                      isMyHealTarget
                        ? 'border-[var(--rpg-green-light)] bg-[var(--rpg-green-light)]/10'
                        : 'border-[var(--rpg-border)] hover:border-[var(--rpg-text-secondary)]'
                    }`
                  : ''
              }`}
              onClick={canHealTarget ? () => onSetHealTarget(isMyHealTarget ? null : m.playerId) : undefined}
            >
              {memberRow}
              {showResources && m.isKnockedOut && m.playerId === playerId && onRecover && (
                <PixelButton
                  size="sm"
                  variant="danger"
                  onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRecover(); }}
                  disabled={actionLoading}
                >
                  Recover
                </PixelButton>
              )}
            </div>
          );
        })}
      </div>
      {showResources && members.some((m) => m.totalDamage > 0 || m.totalHealing > 0) && (
        <div className="mt-3 pt-2 border-t border-[var(--rpg-border)]">
          <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-1">Contributions</h4>
          <div className="space-y-0.5">
            {sortedMembers.map((m) => (
                <div key={`${m.playerId}-contrib`} className="flex justify-between text-xs">
                  <span className="text-[var(--rpg-text-secondary)] truncate">
                    {m.username ?? m.playerId.slice(0, 8)}
                  </span>
                  <div className="flex gap-2">
                    <span className="text-[var(--rpg-red)]">{formatNumber(m.totalDamage)} dmg</span>
                    {m.totalHealing > 0 && (
                      <span className="text-[var(--rpg-green-light)]">{formatNumber(m.totalHealing)} heal</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </PixelCard>
  );
}
