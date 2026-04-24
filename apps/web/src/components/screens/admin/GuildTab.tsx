import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import {
  adminGrantGuildTreasury,
  adminResetExpeditionCooldowns,
  adminFillExpedition,
} from '@/lib/api';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

export function GuildTab() {
  const [treasuryAmount, setTreasuryAmount] = useState(500000);
  const { busy, msg, act } = useAdminAction();

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Guild Treasury</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={treasuryAmount}
            onChange={(e) => setTreasuryAmount(Number(e.target.value))}
            min={1}
            className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-32 text-[var(--rpg-text-primary)]"
          />
          <PixelButton
            size="sm"
            disabled={busy}
            onClick={() => act('Grant treasury', () => adminGrantGuildTreasury(treasuryAmount))}
          >
            Grant Treasury
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Expedition Testing</h3>
        <div className="flex flex-wrap gap-2">
          <PixelButton size="sm" disabled={busy} onClick={() => act('Reset cooldowns', () => adminResetExpeditionCooldowns())}>
            Reset Cooldowns
          </PixelButton>
          <PixelButton size="sm" disabled={busy} onClick={() => act('Fill expedition', () => adminFillExpedition())}>
            Fill with Bots
          </PixelButton>
        </div>
        <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-1.5">
          Reset clears weekly + between-expedition cooldowns. Fill adds bots to a recruiting expedition.
        </p>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}
