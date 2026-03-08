'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { LoadingCard } from '@/components/common/LoadingCard';
import {
  getActiveExpedition,
  getExpeditionStatus,
  launchExpedition,
  signUpForExpedition,
  recoverFromExpeditionKO,
} from '@/lib/api/expedition';
import type {
  ExpeditionDetailResponse,
} from '@/lib/api/expedition';
import type { ExpeditionData, ExpeditionMemberData, ExpeditionRoomType } from '@pocketrealm/shared';
import { EXPEDITION_CONSTANTS } from '@pocketrealm/shared';
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
// Props
// ---------------------------------------------------------------------------

interface GuildExpeditionsTabProps {
  guildId: string;
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

function Countdown({ expiresAt }: { expiresAt: string | null }) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(formatTimeRemaining(expiresAt));
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GuildExpeditionsTab({
  guildId,
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

  const isOfficer = myRole === 'leader' || myRole === 'officer';

  const loadExpedition = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getActiveExpedition();
      if (res.error) { setError(res.error.message); return; }
      if (res.data?.expedition) {
        setExpedition(res.data.expedition);
        const detail = await getExpeditionStatus(res.data.expedition.id);
        if (detail.data) {
          setMembers(detail.data.members);
        }
      } else {
        setExpedition(null);
        setMembers([]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load expedition');
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => { void loadExpedition(); }, [loadExpedition]);

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

  if (loading) return <LoadingCard />;

  // No active expedition
  if (!expedition) {
    return <IdleView isOfficer={isOfficer} characterLevel={characterLevel} actionLoading={actionLoading} onLaunch={handleLaunch} />;
  }

  // Render based on status
  switch (expedition.status) {
    case 'recruiting':
      return (
        <RecruitingView
          expedition={expedition}
          members={members}
          characterLevel={characterLevel}
          actionLoading={actionLoading}
          onSignup={handleSignup}
        />
      );
    case 'in_progress':
      return (
        <InProgressView
          expedition={expedition}
          members={members}
          actionLoading={actionLoading}
          onRecover={handleRecover}
        />
      );
    case 'completed':
      return <CompletedView expedition={expedition} />;
    case 'failed':
      return <FailedView expedition={expedition} />;
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
}: {
  isOfficer: boolean;
  characterLevel: number;
  actionLoading: boolean;
  onLaunch: (tier: number) => void;
}) {
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
                  </div>
                  <PixelButton
                    size="sm"
                    onClick={() => onLaunch(cfg.tier)}
                    disabled={actionLoading || levelTooLow}
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
  characterLevel,
  actionLoading,
  onSignup,
}: {
  expedition: ExpeditionData;
  members: ExpeditionMemberData[];
  characterLevel: number;
  actionLoading: boolean;
  onSignup: () => void;
}) {
  const tierCfg = TIER_CONFIGS.find((c) => c.tier === expedition.tier);
  const meetsLevel = tierCfg ? characterLevel >= tierCfg.levelReq : true;

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
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-blue-light)]/20 text-[var(--rpg-blue-light)]">
            Recruiting
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs mb-3">
          <span className="text-[var(--rpg-text-secondary)]">Participants:</span>
          <span className="text-[var(--rpg-text-primary)]">
            {expedition.participantCount} / {tierCfg?.minParticipants ?? '?'}
          </span>
          <span className="text-[var(--rpg-text-secondary)]">Rooms:</span>
          <span className="text-[var(--rpg-text-primary)]">{expedition.totalRooms}</span>
          <span className="text-[var(--rpg-text-secondary)]">First Round:</span>
          <Countdown expiresAt={expedition.nextRoundAt} />
        </div>

        <PixelButton
          size="sm"
          onClick={onSignup}
          disabled={actionLoading || !meetsLevel}
        >
          {!meetsLevel ? `Level ${tierCfg?.levelReq} Required` : actionLoading ? 'Signing up...' : 'Sign Up'}
        </PixelButton>
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
  actionLoading,
  onRecover,
}: {
  expedition: ExpeditionData;
  members: ExpeditionMemberData[];
  actionLoading: boolean;
  onRecover: () => void;
}) {
  const roomBadge = roomTypeBadge(expedition.currentRoomType);
  const roomPct = expedition.totalRooms > 0
    ? Math.min((expedition.currentRoom / expedition.totalRooms) * 100, 100)
    : 0;

  const isResting = expedition.currentRoomType === null && expedition.status === 'in_progress';

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
          <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]">
            In Progress
          </span>
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
          <Countdown expiresAt={expedition.nextRoundAt} />
        </div>
      </PixelCard>

      {/* Member status */}
      <MemberList members={members} showResources actionLoading={actionLoading} onRecover={onRecover} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Completed View
// ---------------------------------------------------------------------------

function CompletedView({ expedition }: { expedition: ExpeditionData }) {
  return (
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
      </div>
    </PixelCard>
  );
}

// ---------------------------------------------------------------------------
// Failed View
// ---------------------------------------------------------------------------

function FailedView({ expedition }: { expedition: ExpeditionData }) {
  return (
    <PixelCard>
      <div className="text-center space-y-2 py-2">
        <p className="text-sm font-bold text-[var(--rpg-red)]">Expedition Failed</p>
        <p className="text-xs text-[var(--rpg-text-secondary)]">
          Tier {expedition.tier} — Reached room {expedition.currentRoom + 1} / {expedition.totalRooms}
        </p>
        {expedition.participantCount < (TIER_CONFIGS.find((c) => c.tier === expedition.tier)?.minParticipants ?? 0) && (
          <p className="text-xs text-[var(--rpg-text-secondary)]">
            Not enough participants joined in time.
          </p>
        )}
      </div>
    </PixelCard>
  );
}

// ---------------------------------------------------------------------------
// Member List
// ---------------------------------------------------------------------------

function MemberList({
  members,
  showResources,
  actionLoading,
  onRecover,
}: {
  members: ExpeditionMemberData[];
  showResources?: boolean;
  actionLoading?: boolean;
  onRecover?: () => void;
}) {
  if (members.length === 0) return null;

  return (
    <PixelCard>
      <h4 className="text-xs font-bold text-[var(--rpg-text-primary)] mb-2">Participants ({members.length})</h4>
      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.playerId} className="flex items-center gap-2">
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
              </div>
              {showResources && (
                <div className="space-y-0.5">
                  <HpBar
                    current={m.currentHp}
                    max={m.currentHp} // max not provided by API; show current as reference
                    label="HP"
                    color={m.isKnockedOut ? 'var(--rpg-red)' : 'var(--rpg-green-light)'}
                  />
                </div>
              )}
            </div>
            {showResources && m.isKnockedOut && onRecover && (
              <PixelButton size="sm" variant="danger" onClick={onRecover} disabled={actionLoading}>
                Recover
              </PixelButton>
            )}
          </div>
        ))}
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
