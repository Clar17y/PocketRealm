'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExpeditionContext } from '@/lib/assets';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import { useVisibleInterval } from '@/hooks/usePageVisible';
import {
  getActiveExpedition,
  getExpeditionStatus,
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
  ExpeditionData,
  ExpeditionMemberData,
  ExpeditionCooldownInfo,
  CombatTemplateData,
  StateUpdates,
} from '@pocketrealm/shared';
import { IdleView, RecruitingView, InProgressView } from './ExpeditionViews';
import { HistoryView } from './ExpeditionHistory';

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

  // Auto-refresh when expedition is active and the page is actively being used.
  const expeditionPollEnabled = !!expedition && expedition.status !== 'completed' && expedition.status !== 'failed';
  useVisibleInterval(() => void loadExpedition(), 30_000, expeditionPollEnabled);

  // --- Action Handlers ---

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

  // Auto-advance while toggled on and the page is actively being used.
  const [autoAdvance, setAutoAdvance] = useState(false);
  const roundInFlightRef = useRef(false);
  const autoAdvanceEnabled = autoAdvance && expedition?.status === 'in_progress';

  useVisibleInterval(() => {
    if (!autoAdvanceEnabled || !expedition) return;
    if (roundInFlightRef.current) return;

    roundInFlightRef.current = true;
    void (async () => {
      try {
        await forceNextRound(expedition.id);
        await loadExpedition();
      } finally {
        roundInFlightRef.current = false;
      }
    })();
  }, 10_000, autoAdvanceEnabled, { catchUpOnResume: false });

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

  // --- UI Elements ---

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

  // --- Render ---

  if (subTab === 'history') {
    return (
      <>
        {tabBar}
        <HistoryView guildId={guildId} playerId={playerId} />
        {confirmModal}
      </>
    );
  }

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
