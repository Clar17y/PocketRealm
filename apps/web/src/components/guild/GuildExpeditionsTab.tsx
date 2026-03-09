'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { LoadingCard } from '@/components/common/LoadingCard';
import {
  getActiveExpedition,
  getExpeditionStatus,
  getExpeditionHistory,
  launchExpedition,
  signUpForExpedition,
  forceStartExpedition,
  forceNextRound,
  recoverFromExpeditionKO,
  setExpeditionTarget,
  setExpeditionHealTarget,
  abandonExpedition,
  getExpeditionCooldowns,
} from '@/lib/api/expedition';
import type {
  ExpeditionDetailResponse,
} from '@/lib/api/expedition';
import type {
  ExpeditionData,
  ExpeditionMemberData,
  ExpeditionRoomType,
  ExpeditionMobInfo,
  ExpeditionRoundLog,
  ExpeditionCooldownInfo,
} from '@pocketrealm/shared';
import { EXPEDITION_CONSTANTS, mobDisplayName } from '@pocketrealm/shared';
import { formatNumber, formatTimeRemaining } from '@/lib/format';

// ---------------------------------------------------------------------------
// Tier definitions — derived from shared constants
// ---------------------------------------------------------------------------

const TIER_NAMES = ['Forest Depths', 'Cavern Descent', 'Ruined Citadel'];

const TIER_CONFIGS = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER.map((levelReq, i) => ({
  tier: i + 1,
  name: TIER_NAMES[i],
  levelReq,
  treasuryCost: EXPEDITION_CONSTANTS.TREASURY_COST_BY_TIER[i],
  minParticipants: EXPEDITION_CONSTANTS.MIN_PARTICIPANTS_BY_TIER[i],
  totalRooms: EXPEDITION_CONSTANTS.ROOMS_BY_TIER[i],
}));

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
  onTurnsChanged?: () => void;
  onRefresh?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function roomTypeBadge(roomType: ExpeditionRoomType | null): { label: string; color: string } {
  switch (roomType) {
    case 'trash':      return { label: 'Trash',      color: 'var(--rpg-text-secondary)' };
    case 'elite':      return { label: 'Elite',      color: 'var(--rpg-blue-light)' };
    case 'mini_boss':  return { label: 'Mini-Boss',  color: 'var(--rpg-gold)' };
    case 'event':      return { label: 'Event',      color: 'var(--rpg-green-light)' };
    case 'final_boss': return { label: 'Final Boss', color: 'var(--rpg-red)' };
    default:           return { label: 'Unknown',    color: 'var(--rpg-text-secondary)' };
  }
}

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

function HpBar({ current, max, label, color }: { current: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  return (
    <div className="relative w-full h-4 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      <div className="absolute inset-0 flex items-center px-1.5">
        <span className="text-[8px] font-pixel text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {label} {Math.floor(current)}/{max}
        </span>
      </div>
    </div>
  );
}

function EffectBadge({ name, roundsRemaining, isDebuff }: { name: string; roundsRemaining: number; isDebuff: boolean }) {
  return (
    <span
      className={`text-[8px] px-1 py-0 rounded ${
        isDebuff
          ? 'bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]'
          : 'bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]'
      }`}
    >
      {name} ({roundsRemaining})
    </span>
  );
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
  onTurnsChanged,
  onRefresh,
}: GuildExpeditionsTabProps) {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [expedition, setExpedition] = useState<ExpeditionData | null>(null);
  const [members, setMembers] = useState<ExpeditionMemberData[]>([]);
  const [cooldowns, setCooldowns] = useState<ExpeditionCooldownInfo | null>(null);

  const isOfficer = myRole === 'leader' || myRole === 'officer';

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
        // No active expedition — check if one recently finished (show results briefly)
        const history = await getExpeditionHistory(1);
        const latest = history.data?.expeditions?.[0];
        if (latest?.completedAt && Date.now() - new Date(latest.completedAt).getTime() < 3600_000) {
          const detail = await getExpeditionStatus(latest.id);
          if (detail.data) {
            setExpedition(detail.data.expedition);
            setMembers(detail.data.members);
          } else {
            setExpedition(null);
            setMembers([]);
          }
        } else {
          setExpedition(null);
          setMembers([]);
        }
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

  useEffect(() => { void loadExpedition(true); }, [loadExpedition]);

  // Auto-refresh every 30s when expedition is active
  useEffect(() => {
    if (!expedition || expedition.status === 'completed' || expedition.status === 'failed') return;
    const interval = setInterval(() => void loadExpedition(), 30_000);
    return () => clearInterval(interval);
  }, [expedition?.status, loadExpedition]);

  const handleLaunch = async (tier: number) => {
    if (!confirm(`Launch Tier ${tier} expedition? Treasury will be deducted immediately.`)) return;
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
      onTurnsChanged?.();
      void loadExpedition();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign up');
    } finally {
      setActionLoading(false);
    }
  };

  const handleForceStart = async () => {
    if (!expedition) return;
    if (!confirm('Force start the expedition now? The signup window will end immediately.')) return;
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
    if (!confirm('Skip the round timer and resolve the next round immediately?')) return;
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

  const handleRecover = async () => {
    if (!expedition) return;
    setActionLoading(true);
    setError(null);
    try {
      const res = await recoverFromExpeditionKO(expedition.id);
      if (res.error) { setError(res.error.message); return; }
      onTurnsChanged?.();
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

  const handleAbandon = async () => {
    if (!expedition) return;
    if (!confirm('Abandon this expedition? This will end the expedition and trigger a cooldown.')) return;
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

  if (loading) return <LoadingCard />;

  // No active expedition
  if (!expedition) {
    return <IdleView isOfficer={isOfficer} characterLevel={characterLevel} actionLoading={actionLoading} onLaunch={handleLaunch} cooldowns={cooldowns} />;
  }

  // Render based on status
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
          onForceStart={handleForceStart}
          onAbandon={handleAbandon}
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
          onSetTarget={handleSetTarget}
          onSetHealTarget={handleSetHealTarget}
          onAbandon={handleAbandon}
          onRefresh={loadExpedition}
          onExpired={loadExpedition}
        />
      );
    case 'completed':
      return <CompletedView expedition={expedition} members={members} onDismiss={() => { setExpedition(null); setMembers([]); }} />;
    case 'failed':
      return <FailedView expedition={expedition} members={members} onDismiss={() => { setExpedition(null); setMembers([]); }} />;
    default:
      return null;
  }
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
  // Determine cooldown reason per tier
  function getCooldownReason(tier: number): string | null {
    if (!cooldowns) return null;
    if (cooldowns.hasActiveExpedition) return 'Expedition active';
    const weeklyExpiry = cooldowns.weeklyCooldowns[tier];
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
          Embark on multi-room dungeon raids with your guild. Clear rooms of enemies, defeat bosses, and earn expedition tokens for powerful gear.
        </p>
      </PixelCard>

      {isOfficer ? (
        <div className="space-y-2">
          {TIER_CONFIGS.map((cfg) => {
            const levelTooLow = characterLevel < cfg.levelReq;
            const cooldownReason = getCooldownReason(cfg.tier);
            const isDisabled = actionLoading || levelTooLow || !!cooldownReason;
            return (
              <PixelCard key={cfg.tier}>
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-bold text-[var(--rpg-text-primary)]">
                      Tier {cfg.tier} — {cfg.name}
                    </p>
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
                    Launch
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
            {tierCfg && (
              <p className="text-xs text-[var(--rpg-text-secondary)]">{tierCfg.name}</p>
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
  onSetTarget,
  onSetHealTarget,
  onAbandon,
  onRefresh,
  onExpired,
}: {
  expedition: ExpeditionData;
  members: ExpeditionMemberData[];
  playerId: string | null;
  actionLoading: boolean;
  isOfficer: boolean;
  onRecover: () => void;
  onForceRound: () => void;
  onSetTarget: (targetMobId: string | null) => void;
  onSetHealTarget: (healTargetPlayerId: string | null) => void;
  onAbandon: () => void;
  onRefresh: () => void;
  onExpired: () => void;
}) {
  const roomBadge = roomTypeBadge(expedition.currentRoomType);
  const roomPct = expedition.totalRooms > 0
    ? Math.min(((expedition.currentRoom + 0.5) / expedition.totalRooms) * 100, 100)
    : 0;

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
              Tier {expedition.tier} Expedition
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
          <div className="flex justify-between text-xs mb-1">
            <span className="text-[var(--rpg-text-secondary)]">Room Progress</span>
            <span className="text-[var(--rpg-text-primary)]">
              Room {expedition.currentRoom + 1} / {expedition.totalRooms}
            </span>
          </div>
          <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--rpg-bg-dark, #1a1a2e)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${roomPct}%`, backgroundColor: 'var(--rpg-gold)' }}
            />
          </div>
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
          {isOfficer && (
            <PixelButton size="sm" variant="danger" onClick={onAbandon} disabled={actionLoading}>
              Abandon
            </PixelButton>
          )}
        </div>
      </PixelCard>

      {/* Current Room Mobs */}
      {expedition.currentRoomMobs.length > 0 && (
        <PixelCard>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-xs font-bold text-[var(--rpg-text-primary)]">Current Room</h4>
            {myTargetMobId && !amKnockedOut && (
              <button
                onClick={() => onSetTarget(null)}
                className="text-[10px] text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] underline"
              >
                Clear Target
              </button>
            )}
          </div>
          <div className="space-y-2">
            {expedition.currentRoomMobs.map((mob) => {
              const isMyTarget = myTargetMobId === mob.id;
              const count = targetCounts.get(mob.id) ?? 0;
              return (
                <button
                  key={mob.id}
                  onClick={() => !amKnockedOut && onSetTarget(isMyTarget ? null : mob.id)}
                  disabled={amKnockedOut}
                  className={`w-full text-left p-2 rounded border transition-colors ${
                    amKnockedOut
                      ? 'border-[var(--rpg-border)] opacity-50 cursor-not-allowed'
                      : isMyTarget
                        ? 'border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/10'
                        : 'border-[var(--rpg-border)] hover:border-[var(--rpg-text-secondary)]'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-[var(--rpg-text-primary)] font-bold">
                      {mobDisplayName(mob)}
                    </span>
                    <div className="flex gap-1 items-center">
                      {count > 0 && (
                        <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]">
                          {count} targeting
                        </span>
                      )}
                      {isMyTarget && (
                        <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
                          YOUR TARGET
                        </span>
                      )}
                    </div>
                  </div>
                  <HpBar
                    current={mob.hp}
                    max={mob.maxHp}
                    label="HP"
                    color={mob.hp <= mob.maxHp * 0.25 ? 'var(--rpg-red)' : 'var(--rpg-green-light)'}
                  />
                  {mob.activeEffects?.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {mob.activeEffects.map((eff, idx) => (
                        <EffectBadge key={idx} name={eff.name} roundsRemaining={eff.roundsRemaining} isDebuff={true} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </PixelCard>
      )}

      {/* Round Logs */}
      {expedition.roundLogs.length > 0 && (
        <RoundLogList logs={expedition.roundLogs} playerId={playerId} />
      )}

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Round Log Display
// ---------------------------------------------------------------------------

function roundKey(log: ExpeditionRoundLog): string {
  return `${log.roomIndex}-${log.round}`;
}

function RoundLogList({ logs, playerId }: { logs: ExpeditionRoundLog[]; playerId: string | null }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // Auto-expand latest log entry
  const latestIdx = logs.length > 0 ? logs.length - 1 : null;
  const effectiveExpanded = expandedKey ?? (latestIdx !== null ? String(latestIdx) : null);

  // Reverse with original indices for stable keys
  const reversedLogs = logs.map((log, i) => ({ log, idx: i })).reverse();

  return (
    <PixelCard>
      <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-2">Round Log</h4>
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
                <div className="flex gap-2 text-[10px]">
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
                <div className="px-2 pb-2 space-y-2">
                  {/* Player Attacks */}
                  {log.phases.playerAttacks.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[var(--rpg-text-secondary)] font-bold mb-0.5">Attacks</p>
                      {log.phases.playerAttacks.map((atk, j) => {
                        const isMe = atk.playerId === playerId;
                        if (isMe) {
                          return (
                            <div key={j} className="text-[10px] ml-2 mb-0.5 p-1 rounded bg-[var(--rpg-surface)]">
                              <span className="text-[var(--rpg-gold)] font-bold">{atk.actionLabel}</span>
                              {' → '}
                              <span className="text-[var(--rpg-text-primary)]">{atk.targetMobName}</span>
                              {' | '}
                              <span className="text-[var(--rpg-text-secondary)]">
                                d20({atk.attackRoll})+{atk.modifier} vs {atk.defenseTarget}
                              </span>
                              {' | '}
                              {atk.hit ? (
                                <>
                                  <span className={atk.crit ? 'text-[var(--rpg-gold)] font-bold' : 'text-[var(--rpg-green-light)]'}>
                                    {atk.crit ? 'CRIT' : 'HIT'}
                                  </span>
                                  {atk.totalDamage !== undefined && (
                                    <span className="text-[var(--rpg-red)]"> {atk.totalDamage} dmg</span>
                                  )}
                                </>
                              ) : (
                                <span className="text-[var(--rpg-text-secondary)]">MISS</span>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div key={j} className="text-[10px] ml-2 text-[var(--rpg-text-secondary)]">
                            <span className="text-[var(--rpg-text-primary)]">{atk.username}</span>
                            {': '}
                            {atk.actionLabel}
                            {' → '}
                            {atk.hit ? (
                              <>
                                <span className={atk.crit ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-green-light)]'}>
                                  {atk.crit ? 'CRIT' : 'HIT'}
                                </span>
                                {atk.totalDamage !== undefined && ` ${atk.totalDamage} dmg`}
                              </>
                            ) : (
                              'MISS'
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Healing */}
                  {log.phases.healing.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[var(--rpg-text-secondary)] font-bold mb-0.5">Healing</p>
                      {log.phases.healing.map((h, j) => (
                        <div key={j} className="text-[10px] ml-2 text-[var(--rpg-green-light)]">
                          {h.username}: {h.actionLabel} → {h.targetUsername} +{h.amountHealed} HP
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Mob Actions */}
                  {log.phases.mobActions.length > 0 && (
                    <div>
                      <p className="text-[10px] text-[var(--rpg-text-secondary)] font-bold mb-0.5">Enemy Actions</p>
                      {log.phases.mobActions.map((ma, j) => (
                        <div
                          key={j}
                          className={`text-[10px] ml-2 mb-0.5 p-1 rounded ${
                            ma.wasTelegraphed
                              ? 'border border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/5'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            <span className="text-[var(--rpg-red)] font-bold">{ma.mobName}</span>
                            <span className="text-[var(--rpg-text-secondary)]">uses</span>
                            <span className="text-[var(--rpg-text-primary)]">{ma.actionLabel}</span>
                            {ma.wasTelegraphed && (
                              <span className="px-1 py-0 rounded text-[8px] bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
                                TELEGRAPHED
                              </span>
                            )}
                            {ma.targetMode === 'aoe' && (
                              <span className="px-1 py-0 rounded text-[8px] bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]">
                                AOE
                              </span>
                            )}
                          </div>
                          {ma.targets.length > 0 && (
                            <div className="ml-2 mt-0.5">
                              {ma.targets.map((t, k) => (
                                <div key={k} className="text-[var(--rpg-text-secondary)]">
                                  {t.username}: {t.blocked ? (
                                    <span className="text-[var(--rpg-blue-light)]">BLOCKED</span>
                                  ) : (
                                    <>
                                      <span className="text-[var(--rpg-red)]">-{t.damageTaken} HP</span>
                                      {t.knockedOut && <span className="text-[var(--rpg-red)] font-bold"> KO!</span>}
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Telegraphs */}
                  {log.telegraphs.length > 0 && (
                    <div className="border border-[var(--rpg-gold)] bg-[var(--rpg-gold)]/5 rounded p-1.5">
                      <p className="text-[10px] text-[var(--rpg-gold)] font-bold mb-0.5">Next Round Warning</p>
                      {log.telegraphs.map((t, j) => (
                        <div key={j} className="text-[10px] text-[var(--rpg-gold)]">
                          {t.warningText}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Outcome */}
                  <div className="text-[10px] text-[var(--rpg-text-secondary)] border-t border-[var(--rpg-border)] pt-1">
                    Mobs: {outcome.mobsAlive} alive, {outcome.mobsKilled} killed
                    {' | '}
                    Players: {outcome.playersAlive} alive{outcome.playersKnockedOut > 0 && `, ${outcome.playersKnockedOut} KO`}
                  </div>
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
// Completed View
// ---------------------------------------------------------------------------

function CompletedView({ expedition, members, onDismiss }: { expedition: ExpeditionData; members: ExpeditionMemberData[]; onDismiss: () => void }) {
  const sorted = [...members].sort((a, b) => (b.totalDamage + b.totalHealing) - (a.totalDamage + a.totalHealing));

  return (
    <div className="space-y-3">
      <PixelCard>
        <div className="text-center space-y-2 py-2">
          <p className="text-sm font-bold text-[var(--rpg-green-light)]">Expedition Complete!</p>
          <p className="text-xs text-[var(--rpg-text-secondary)]">
            Tier {expedition.tier} — {expedition.totalRooms} rooms cleared
          </p>
          {expedition.completedAt && (
            <p className="text-xs text-[var(--rpg-text-secondary)]">
              Completed: {new Date(expedition.completedAt).toLocaleString()}
            </p>
          )}
          <PixelButton size="sm" onClick={onDismiss} className="mt-2">
            Back to Expeditions
          </PixelButton>
        </div>
      </PixelCard>

      {sorted.length > 0 && (
        <PixelCard>
          <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-2">Contributions</h4>
          <div className="space-y-1">
            {sorted.map((m, i) => (
              <div key={m.playerId} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--rpg-gold)] font-bold w-4">{i + 1}.</span>
                  <span className="text-[var(--rpg-text-primary)]">{m.username ?? m.playerId.slice(0, 8)}</span>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-[var(--rpg-red)]">{formatNumber(m.totalDamage)} dmg</span>
                  {m.totalHealing > 0 && (
                    <span className="text-[var(--rpg-green-light)]">{formatNumber(m.totalHealing)} heal</span>
                  )}
                  {m.tokensEarned > 0 && (
                    <span className="text-[var(--rpg-gold)]">{formatNumber(m.tokensEarned)} tokens</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      )}

      {expedition.roundLogs.length > 0 && (
        <RoundLogList logs={expedition.roundLogs} playerId={null} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Failed View
// ---------------------------------------------------------------------------

function FailedView({ expedition, members, onDismiss }: { expedition: ExpeditionData; members: ExpeditionMemberData[]; onDismiss: () => void }) {
  const sorted = [...members].sort((a, b) => (b.totalDamage + b.totalHealing) - (a.totalDamage + a.totalHealing));

  return (
    <div className="space-y-3">
      <PixelCard>
        <div className="text-center space-y-2 py-2">
          <p className="text-sm font-bold text-[var(--rpg-red)]">Expedition Failed</p>
          <p className="text-xs text-[var(--rpg-text-secondary)]">
            Tier {expedition.tier} — Reached room {expedition.currentRoom + 1} / {expedition.totalRooms}
          </p>
          {expedition.wipeCount > 0 && (
            <p className="text-xs text-[var(--rpg-text-secondary)]">
              Failed after {expedition.wipeCount} wipe{expedition.wipeCount > 1 ? 's' : ''} across {expedition.attemptNumber} attempt{expedition.attemptNumber > 1 ? 's' : ''}
            </p>
          )}
          {expedition.participantCount < (TIER_CONFIGS.find((c) => c.tier === expedition.tier)?.minParticipants ?? 0) && (
            <p className="text-xs text-[var(--rpg-text-secondary)]">
              Not enough participants joined in time.
            </p>
          )}
          <PixelButton size="sm" onClick={onDismiss} className="mt-2">
            Back to Expeditions
          </PixelButton>
        </div>
      </PixelCard>

      {sorted.length > 0 && sorted.some(m => m.totalDamage > 0 || m.totalHealing > 0) && (
        <PixelCard>
          <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-2">Contributions</h4>
          <div className="space-y-1">
            {sorted.map((m, i) => (
              <div key={m.playerId} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-[var(--rpg-text-secondary)] font-bold w-4">{i + 1}.</span>
                  <span className="text-[var(--rpg-text-primary)]">{m.username ?? m.playerId.slice(0, 8)}</span>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-[var(--rpg-red)]">{formatNumber(m.totalDamage)} dmg</span>
                  {m.totalHealing > 0 && (
                    <span className="text-[var(--rpg-green-light)]">{formatNumber(m.totalHealing)} heal</span>
                  )}
                  {m.tokensEarned > 0 && (
                    <span className="text-[var(--rpg-gold)]">{formatNumber(m.tokensEarned)} tokens</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      )}

      {expedition.roundLogs.length > 0 && (
        <RoundLogList logs={expedition.roundLogs} playerId={null} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member List
// ---------------------------------------------------------------------------

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
      <div className="space-y-2">
        {members.map((m) => {
          const isMyHealTarget = myHealTargetPlayerId === m.playerId;
          const memberRow = (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs text-[var(--rpg-text-primary)] truncate">
                  {m.username ?? m.playerId.slice(0, 8)}
                </span>
                {m.isKnockedOut && (
                  <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--rpg-red)]/20 text-[var(--rpg-red)]">
                    KO
                  </span>
                )}
                {isMyHealTarget && (
                  <span className="text-[10px] px-1.5 py-0 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]">
                    HEAL TARGET
                  </span>
                )}
              </div>
              {m.activeEffects?.length > 0 && (
                <div className="flex flex-wrap gap-0.5">
                  {m.activeEffects.map((eff, idx) => {
                    const isDebuff = eff.stat === 'potionSickness' || (eff.modifier ?? 0) < 0;
                    return <EffectBadge key={idx} name={eff.name} roundsRemaining={eff.roundsRemaining} isDebuff={isDebuff} />;
                  })}
                </div>
              )}
              {showResources && (
                <div className="space-y-0.5">
                  <HpBar
                    current={m.currentHp}
                    max={m.maxHp}
                    label="HP"
                    color={m.isKnockedOut ? 'var(--rpg-red)' : 'var(--rpg-green-light)'}
                  />
                </div>
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
            {members
              .sort((a, b) => b.totalDamage - a.totalDamage)
              .map((m) => (
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
