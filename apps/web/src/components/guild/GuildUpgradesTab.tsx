'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { getGuildUpgrades, activateGuildUpgrade, type GuildUpgradesResponse } from '@/lib/api';
import { formatNumber, formatDuration, formatTimeRemaining } from '@/lib/format';

const EFFECT_LABELS: Record<string, string> = {
  xp_boost: 'Skill XP',
  gathering_yield: 'Gathering Yield',
  crafting_crit: 'Crafting Crit',
  combat_damage: 'Combat Damage',
  defense_boost: 'Defense',
};

interface GuildUpgradesTabProps {
  guildId: string;
  myRole: string;
  setError: (err: string | null) => void;
}

export function GuildUpgradesTab({
  guildId,
  myRole,
  setError,
}: GuildUpgradesTabProps) {
  const [data, setData] = useState<GuildUpgradesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activating, setActivating] = useState(false);

  const isOfficer = myRole === 'leader' || myRole === 'officer';

  const loadUpgrades = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildUpgrades(guildId);
      if (res.data) setData(res.data);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void loadUpgrades(); }, [loadUpgrades]);

  const handleActivate = async (upgradeKey: string, tier: number) => {
    setActivating(true);
    setError(null);
    try {
      const res = await activateGuildUpgrade(guildId, upgradeKey, tier);
      if (res.error) { setError(res.error.message); return; }
      void loadUpgrades();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to activate');
    } finally {
      setActivating(false);
    }
  };

  if (loading && !data) return <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>;

  return (
    <div className="space-y-3">
      {data?.available.map((upgrade) => (
        <PixelCard key={upgrade.key}>
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="text-sm font-bold text-[var(--rpg-text-primary)]">{upgrade.name}</p>
              <p className="text-xs text-[var(--rpg-text-secondary)]">{EFFECT_LABELS[upgrade.effectType] ?? upgrade.effectType}</p>
            </div>
            {upgrade.activeUpgrade && (
              <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]">
                Active &middot; {formatTimeRemaining(upgrade.activeUpgrade.expiresAt)}
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {upgrade.tiers.map((tier) => (
              <div key={tier.level} className="flex items-center justify-between text-xs p-2 bg-[var(--rpg-background)] rounded">
                <div>
                  <span className="text-[var(--rpg-text-secondary)]">Tier {tier.level}</span>
                  <span className="ml-2 text-[var(--rpg-gold)]">+{Math.round(tier.effectValue * 100)}%</span>
                  <span className="ml-2 text-[var(--rpg-text-secondary)]">{formatDuration(tier.durationMs)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--rpg-text-secondary)]">{formatNumber(tier.cost)} turns</span>
                  {isOfficer && (
                    <button
                      onClick={() => handleActivate(upgrade.key, tier.level)}
                      disabled={activating || !tier.available}
                      className={`px-2 py-0.5 rounded text-xs ${
                        tier.available
                          ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]'
                          : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] opacity-50'
                      }`}
                      title={tier.reason}
                    >
                      Activate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      ))}
    </div>
  );
}
