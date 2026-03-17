'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { LoadingCard } from '@/components/common/LoadingCard';
import { ConfirmModal } from '@/components/common/ConfirmModal';
import {
  getGuildSpecialization, selectGuildSpecialization, respecGuildSpecialization,
  GUILD_MODIFIER_LABELS,
  type SpecializationStatusResponse,
} from '@/lib/api/guild';
import { GUILD_CONSTANTS, GUILD_SPECIALIZATION_DEFINITIONS } from '@pocketrealm/shared';
import { formatNumber } from '@/lib/format';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { ErrorBanner } from '@/components/common/ErrorBanner';

const PATH_COLORS: Record<string, { primary: string; bg: string }> = {
  warfare: { primary: 'var(--rpg-red)', bg: 'var(--rpg-red)' },
  industry: { primary: 'var(--rpg-gold)', bg: 'var(--rpg-gold)' },
  discovery: { primary: 'var(--rpg-blue-light)', bg: 'var(--rpg-blue-light)' },
};

interface GuildSpecializationTabProps {
  guildId: string;
  guildLevel: number;
  myRole: string;
}

export function GuildSpecializationTab({ guildId, guildLevel, myRole }: GuildSpecializationTabProps) {
  const [status, setStatus] = useState<SpecializationStatusResponse | null | undefined>(undefined);
  const load = useAsyncAction();
  const action = useAsyncAction();
  const [pendingConfirm, setPendingConfirm] = useState<{ type: 'select' | 'respec'; path: string } | null>(null);

  const isLeader = myRole === 'leader';

  const loadSpec = useCallback(() => {
    load.run(() => getGuildSpecialization(guildId), (data) => setStatus(data ?? null));
  }, [guildId, load.run]);

  useEffect(() => { void loadSpec(); }, [loadSpec]);

  const handleSelect = (path: string) =>
    action.run(() => selectGuildSpecialization(guildId, path), () => void loadSpec());

  const handleRespec = (path: string) =>
    action.run(() => respecGuildSpecialization(guildId, path), () => void loadSpec());

  const confirmModal = pendingConfirm && (
    <ConfirmModal
      title={pendingConfirm.type === 'select' ? 'Select Specialization?' : 'Respec Specialization?'}
      message={pendingConfirm.type === 'select'
        ? `Select ${pendingConfirm.path} specialization? This choice can be changed later via respec.`
        : `Respec to ${pendingConfirm.path}? This costs ${formatNumber(GUILD_CONSTANTS.SPECIALIZATION_RESPEC_COST)} treasury turns.`}
      confirmLabel={pendingConfirm.type === 'select' ? 'Select' : 'Respec'}
      variant="warning"
      onConfirm={() => {
        const { type, path } = pendingConfirm;
        setPendingConfirm(null);
        type === 'select' ? void handleSelect(path) : void handleRespec(path);
      }}
      onCancel={() => setPendingConfirm(null)}
    />
  );

  const errorBanner = (load.error || action.error) ? <ErrorBanner message={(load.error || action.error)!} /> : null;

  if (load.loading && status === undefined) {
    return <>{confirmModal}<LoadingCard /></>;
  }

  // Guild level too low
  if (guildLevel < GUILD_CONSTANTS.SPECIALIZATION_UNLOCK_LEVEL) {
    return (
      <div className="space-y-3">
        {confirmModal}
        {errorBanner}
        <PixelCard>
          <p className="text-sm text-[var(--rpg-text-secondary)]">
            Specialization unlocks at guild level {GUILD_CONSTANTS.SPECIALIZATION_UNLOCK_LEVEL}.
            <span className="ml-1 text-[var(--rpg-text-primary)]">(Currently level {guildLevel})</span>
          </p>
        </PixelCard>
        <SpecPathPreview />
      </div>
    );
  }

  // No specialization selected yet
  if (!status) {
    return (
      <div className="space-y-3">
        {errorBanner}
        <PixelCard>
          <p className="text-sm text-[var(--rpg-text-secondary)] mb-3">
            Choose a specialization path for your guild. All active members receive passive bonuses.
          </p>
        </PixelCard>
        {GUILD_SPECIALIZATION_DEFINITIONS.map((spec) => {
          const colors = PATH_COLORS[spec.path] ?? PATH_COLORS.warfare;
          return (
            <PixelCard key={spec.path}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold" style={{ color: colors.primary }}>{spec.name}</p>
                  <p className="text-xs text-[var(--rpg-text-secondary)]">{spec.description}</p>
                </div>
                {isLeader && (
                  <PixelButton onClick={() => setPendingConfirm({ type: 'select', path: spec.path })} disabled={action.loading}>
                    Select
                  </PixelButton>
                )}
              </div>
              <SpecTierList tiers={spec.tiers} guildLevel={guildLevel} activeTier={0} pathColor={colors.primary} />
            </PixelCard>
          );
        })}
        {confirmModal}
      </div>
    );
  }

  // Has specialization
  const colors = PATH_COLORS[status.path] ?? PATH_COLORS.warfare;
  const specDef = GUILD_SPECIALIZATION_DEFINITIONS.find((s) => s.path === status.path);
  const otherPaths = GUILD_SPECIALIZATION_DEFINITIONS.filter((s) => s.path !== status.path);

  return (
    <div className="space-y-3">
      {(load.error || action.error) && <ErrorBanner message={(load.error || action.error)!} />}
      {/* Current Specialization */}
      <PixelCard>
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-lg font-bold" style={{ color: colors.primary }}>{status.name}</p>
            <p className="text-xs text-[var(--rpg-text-secondary)]">{status.description}</p>
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded font-bold"
            style={{ backgroundColor: `${colors.bg}20`, color: colors.primary }}
          >
            Tier {status.activeTier}
          </span>
        </div>

        {/* Active Bonuses */}
        <div className="mb-3">
          <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">Active Bonuses</p>
          <div className="flex flex-wrap gap-2">
            {status.bonuses.map((bonus, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: `${colors.bg}20`, color: colors.primary }}
              >
                +{Math.round(bonus.value * 100)}% {GUILD_MODIFIER_LABELS[bonus.effectType] ?? bonus.effectType}
              </span>
            ))}
          </div>
        </div>

        {/* Next Tier */}
        {status.nextTier && (
          <div className="p-2 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
            <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">
              Next Tier (Level {status.nextTier.guildLevelGate})
            </p>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-[var(--rpg-text-secondary)]">Progress</span>
              <span className="text-[var(--rpg-text-secondary)]">
                {guildLevel} / {status.nextTier.guildLevelGate}
              </span>
            </div>
            <div className="h-2 rounded-full" style={{ backgroundColor: 'var(--rpg-bg-dark, #1a1a2e)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (guildLevel / status.nextTier.guildLevelGate) * 100)}%`,
                  backgroundColor: colors.primary,
                }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {status.nextTier.bonuses.map((bonus, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]">
                  +{Math.round(bonus.value * 100)}% {GUILD_MODIFIER_LABELS[bonus.effectType] ?? bonus.effectType}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Full tier breakdown */}
        {specDef && (
          <div className="mt-3">
            <SpecTierList tiers={specDef.tiers} guildLevel={guildLevel} activeTier={status.activeTier} pathColor={colors.primary} />
          </div>
        )}
      </PixelCard>

      {/* Respec */}
      {isLeader && (
        <PixelCard>
          <p className="text-sm font-bold text-[var(--rpg-text-primary)] mb-2">Respec Specialization</p>
          <p className="text-xs text-[var(--rpg-text-secondary)] mb-3">
            Cost: {formatNumber(GUILD_CONSTANTS.SPECIALIZATION_RESPEC_COST)} treasury turns
          </p>
          <div className="space-y-2">
            {otherPaths.map((spec) => {
              const c = PATH_COLORS[spec.path] ?? PATH_COLORS.warfare;
              return (
                <div key={spec.path} className="flex justify-between items-center p-2 bg-[var(--rpg-background)] rounded border border-[var(--rpg-border)]">
                  <div>
                    <p className="text-sm font-bold" style={{ color: c.primary }}>{spec.name}</p>
                    <p className="text-xs text-[var(--rpg-text-secondary)]">{spec.description}</p>
                  </div>
                  <PixelButton onClick={() => setPendingConfirm({ type: 'respec', path: spec.path })} disabled={action.loading}>
                    Respec
                  </PixelButton>
                </div>
              );
            })}
          </div>
        </PixelCard>
      )}
      {confirmModal}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier List
// ---------------------------------------------------------------------------

function SpecTierList({
  tiers,
  guildLevel,
  activeTier,
  pathColor,
}: {
  tiers: readonly { tier: number; guildLevelGate: number; bonuses: readonly { effectType: string; value: number }[] }[];
  guildLevel: number;
  activeTier: number;
  pathColor: string;
}) {
  return (
    <div className="space-y-1.5">
      {tiers.map((tier) => {
        const isActive = tier.tier <= activeTier;
        const isUnlocked = guildLevel >= tier.guildLevelGate;
        return (
          <div
            key={tier.tier}
            className={`p-2 rounded text-xs ${isActive ? '' : 'opacity-50'}`}
            style={{
              backgroundColor: isActive ? `${pathColor}10` : 'var(--rpg-background)',
              borderLeft: `3px solid ${isActive ? pathColor : 'var(--rpg-border)'}`,
            }}
          >
            <div className="flex justify-between mb-0.5">
              <span className="font-bold" style={{ color: isActive ? pathColor : 'var(--rpg-text-secondary)' }}>
                Tier {tier.tier}
              </span>
              <span className="text-[var(--rpg-text-secondary)]">
                {isUnlocked ? 'Unlocked' : `Level ${tier.guildLevelGate}`}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {tier.bonuses.map((bonus, i) => (
                <span key={i} className="text-[10px] px-1 py-0.5 rounded bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]">
                  +{Math.round(bonus.value * 100)}% {GUILD_MODIFIER_LABELS[bonus.effectType] ?? bonus.effectType}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Path Preview (for locked state)
// ---------------------------------------------------------------------------

function SpecPathPreview() {
  return (
    <div className="space-y-2 opacity-60">
      {GUILD_SPECIALIZATION_DEFINITIONS.map((spec) => {
        const colors = PATH_COLORS[spec.path] ?? PATH_COLORS.warfare;
        return (
          <PixelCard key={spec.path}>
            <p className="text-sm font-bold" style={{ color: colors.primary }}>{spec.name}</p>
            <p className="text-xs text-[var(--rpg-text-secondary)]">{spec.description}</p>
          </PixelCard>
        );
      })}
    </div>
  );
}
