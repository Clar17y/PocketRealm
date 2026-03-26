'use client';

import { useCallback, useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { SkeletonCard } from '@/components/common/LoadingSkeleton';
import { getGuildContracts, type GuildContractsResponse } from '@/lib/api';
import { formatNumber, formatTimeRemaining } from '@/lib/format';

interface GuildContractsTabProps {
  guildId: string;
}

export function GuildContractsTab({ guildId }: GuildContractsTabProps) {
  const [data, setData] = useState<GuildContractsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getGuildContracts(guildId);
      if (res.data) setData(res.data);
    } catch { /* */ } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void loadContracts(); }, [loadContracts]);

  if (loading && !data) return <SkeletonCard count={2} />;

  if (!data?.contracts.length) {
    return <PixelCard><p className="text-sm text-[var(--rpg-text-secondary)]">No active contracts this week.</p></PixelCard>;
  }

  return (
    <div className="space-y-3">
      {data.contracts.map((contract) => {
        const progress = Math.min(100, Math.floor((contract.currentValue / contract.targetValue) * 100));
        const isComplete = contract.status === 'completed';
        return (
          <PixelCard key={contract.id}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <p className="text-sm font-bold text-[var(--rpg-text-primary)]">{contract.name}</p>
                <p className="text-xs text-[var(--rpg-text-secondary)]">
                  {formatNumber(contract.currentValue)} / {formatNumber(contract.targetValue)}
                </p>
              </div>
              {isComplete ? (
                <span className="text-xs px-2 py-0.5 rounded bg-[var(--rpg-green-light)]/20 text-[var(--rpg-green-light)]">Complete</span>
              ) : (
                <span className="text-xs text-[var(--rpg-text-secondary)]">{formatTimeRemaining(contract.expiresAt)}</span>
              )}
            </div>
            <div className="w-full h-2 bg-[var(--rpg-background)] rounded-full overflow-hidden mb-1.5">
              <div
                className={`h-full transition-all ${isComplete ? 'bg-[var(--rpg-green-light)]' : 'bg-[var(--rpg-gold)]'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="flex gap-3 text-xs text-[var(--rpg-text-secondary)]">
              <span>+{contract.rewardGuildXp} Guild XP</span>
              <span>+{formatNumber(contract.rewardTreasuryTurns)} Treasury</span>
              <span>+{contract.rewardRenown} Renown</span>
            </div>
          </PixelCard>
        );
      })}
    </div>
  );
}
