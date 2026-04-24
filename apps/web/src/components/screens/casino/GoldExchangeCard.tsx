import { Coins } from 'lucide-react';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { CASINO_CONSTANTS } from '@pocketrealm/shared';

interface GoldExchangeCardProps {
  turns: number;
  exchangeTurns: number;
  isExchanging: boolean;
  onExchangeTurnsChange: (next: number) => void;
  onExchange: () => void;
}

export function GoldExchangeCard({
  turns,
  exchangeTurns,
  isExchanging,
  onExchangeTurnsChange,
  onExchange,
}: GoldExchangeCardProps) {
  return (
    <PixelCard>
      <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3 flex items-center gap-2">
        <Coins size={18} className="text-[var(--rpg-gold)]" />
        Gold Exchange
      </h3>
      <div className="flex items-center gap-2 text-xs text-[var(--rpg-text-secondary)] mb-3">
        <span>
          Rate: <span className="font-pixel text-[8px]">{CASINO_CONSTANTS.GOLD_EXCHANGE_RATE}</span> turn ={' '}
          <span className="font-pixel text-[8px]">{CASINO_CONSTANTS.GOLD_EXCHANGE_RATE}</span> gold
        </span>
        <span className="mx-1">|</span>
        <span>
          <span className="font-pixel text-[8px]">{turns.toLocaleString()}</span> turns available
        </span>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={1}
          max={turns}
          value={exchangeTurns}
          onChange={(event) => onExchangeTurnsChange(Math.max(1, parseInt(event.target.value, 10) || 0))}
          className="flex-1 px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-[12px] font-pixel"
          placeholder="Turns to exchange"
        />
        <PixelButton
          variant="gold"
          size="sm"
          onClick={onExchange}
          disabled={isExchanging || exchangeTurns <= 0 || exchangeTurns > turns}
        >
          {isExchanging
            ? 'Exchanging...'
            : `Exchange for ${(exchangeTurns * CASINO_CONSTANTS.GOLD_EXCHANGE_RATE).toLocaleString()} gold`}
        </PixelButton>
      </div>
    </PixelCard>
  );
}
