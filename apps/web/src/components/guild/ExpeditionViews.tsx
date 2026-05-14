'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { ResourceStatusBar } from '@/components/common/ResourceStatusBar';
import {
  EffectPill, roomTypeBadge, RoomProgressBar, MobCardGrid, CombatRoundLog, TemplateQuickSwitch, ThreatMeter, } from '@/components/common/combat';
import { formatNumber, formatTimeRemaining } from '@/lib/format';
import { EXPEDITION_CONSTANTS } from '@pocketrealm/shared';
import { EXPEDITION_THEMES } from '@pocketrealm/shared/constants/expeditionDefinitions';
import type {
  ExpeditionData,
  ExpeditionMemberData,
  ExpeditionCooldownInfo,
  CombatTemplateData,
} from '@pocketrealm/shared';
import { PreviousAttemptsSection } from './ExpeditionHistory';

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

export const TIER_CONFIGS = EXPEDITION_CONSTANTS.LEVEL_REQUIREMENT_BY_TIER.map((levelReq, i) => {
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

export function AttemptBadge({ attemptNumber }: { attemptNumber: number }) {
  if (attemptNumber <= 1) return null;
  return (
    <span className="text-xs text-[var(--rpg-text-secondary)]">
      Attempt {attemptNumber}/{EXPEDITION_CONSTANTS.MAX_ATTEMPTS}
    </span>
  );
}

export function Countdown({ expiresAt, onExpired }: { expiresAt: string | null; onExpired?: () => void }) {
  const [remaining, setRemaining] = useState('');
  const firedRef = useRef(false);
  const onExpiredRef = useRef(onExpired);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    if (!expiresAt) return;
    const expiresAtMs = new Date(expiresAt).getTime();

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
// Member List
// ---------------------------------------------------------------------------

export function MemberList({
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

// ---------------------------------------------------------------------------
// Idle View — No Active Expedition
// ---------------------------------------------------------------------------

export function IdleView({
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

export function RecruitingView({
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

export function InProgressView({
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
              <PixelButton size="sm" onClick={onAutoResolve} disabled={actionLoading}>
                {actionLoading ? 'Resolving...' : 'Auto-Resolve'}
              </PixelButton>
              <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-1">
                Instant clear — templates locked
              </p>
            </div>
          )}
          {isOfficer && expedition.nextRoundAt && (
            <div>
              <PixelButton size="sm" variant="danger" onClick={onForceRound} disabled={actionLoading}>
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

      {myMember && (
        <TemplateQuickSwitch
          templates={templates}
          activeTemplateId={templates.find(t => t.isActive)?.id ?? null}
          onActivate={onActivateTemplate}
        />
      )}

      <MobCardGrid
        mobs={expedition.currentRoomMobs}
        myTargetMobId={myTargetMobId}
        targetCounts={targetCounts}
        onSetTarget={onSetTarget}
        disabled={amKnockedOut}
      />

      <CombatRoundLog
        roundLogs={expedition.roundLogs}
        playerId={playerId}
        multiRoom={expedition.roundLogs.some(l => l.roomIndex !== expedition.roundLogs[0]?.roomIndex)}
      />

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

      {expedition.attemptLogs.length > 0 && (
        <PreviousAttemptsSection attemptLogs={expedition.attemptLogs} playerId={playerId} />
      )}
    </div>
  );
}
