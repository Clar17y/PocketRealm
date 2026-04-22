import { Clock } from 'lucide-react';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import { CASINO_CONSTANTS, getNumberColor, type RouletteBetType, type RouletteRoundState } from '@pocketrealm/shared';
import { ChipStackIndicator } from './ChipStackIndicator';
import {
  BOARD_ROWS,
  CORNER_POSITIONS,
  colorClass,
  formatBet,
  type CasinoChipMap,
  type SelectedRouletteBet,
} from './casinoUtils';

interface RouletteBoardCardProps {
  roundState: RouletteRoundState | null;
  selectedBetType: RouletteBetType | null;
  selectedBetValue: string;
  betAmount: number;
  gold: number;
  isBetting: boolean;
  atMaxBets: boolean;
  myBetCount: number;
  highlightedNumbers: Set<number>;
  chipMap: CasinoChipMap;
  onSelectBet: (type: RouletteBetType, value: string) => void;
  onSetHoveredBet: (bet: SelectedRouletteBet | null) => void;
  onBetAmountChange: (amount: number) => void;
  onPlaceBet: () => void;
}

export function RouletteBoardCard({
  roundState,
  selectedBetType,
  selectedBetValue,
  betAmount,
  gold,
  isBetting,
  atMaxBets,
  myBetCount,
  highlightedNumbers,
  chipMap,
  onSelectBet,
  onSetHoveredBet,
  onBetAmountChange,
  onPlaceBet,
}: RouletteBoardCardProps) {
  const timeRemaining = roundState?.timeRemainingMs
    ? Math.max(0, Math.ceil(roundState.timeRemainingMs / 1000))
    : 0;
  const canBet = roundState?.phase === 'betting'
    && !!selectedBetType
    && betAmount > 0
    && betAmount <= gold
    && !atMaxBets;

  return (
    <PixelCard>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[var(--rpg-text-primary)] flex items-center gap-2">
          <Clock size={18} />
          Roulette
        </h3>
        <RoundPhaseIndicator phase={roundState?.phase ?? 'idle'} timeRemaining={timeRemaining} />
      </div>

      {roundState?.phase === 'result' && roundState.result !== null && (
        <div className="text-center py-4 mb-3">
          <div className="text-sm text-[var(--rpg-text-secondary)] mb-2">Result</div>
          <div
            className={`inline-flex items-center justify-center w-16 h-16 rounded-full text-2xl font-bold ${colorClass(getNumberColor(roundState.result))}`}
          >
            {roundState.result}
          </div>
        </div>
      )}

      {roundState?.phase === 'spinning' && (
        <div className="text-center py-6 mb-3">
          <div className="animate-spin inline-block w-12 h-12 rounded-full border-4 border-[var(--rpg-border)] border-t-[var(--rpg-gold)]" />
          <div className="text-sm text-[var(--rpg-text-secondary)] mt-2 animate-pulse">
            Spinning...
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[280px]">
          <button
            onClick={() => onSelectBet('straight', '0')}
            className={`w-full h-9 rounded-t-lg text-sm font-bold transition-all border-2 ${
              selectedBetType === 'straight' && selectedBetValue === '0'
                ? 'border-[var(--rpg-gold)] ring-2 ring-[var(--rpg-gold)]/50'
                : 'border-transparent'
            } ${colorClass('green')} hover:opacity-80`}
          >
            0
          </button>

          <div className="relative">
            <div className="grid grid-cols-3 gap-px bg-[var(--rpg-border)]">
              {BOARD_ROWS.map((row) =>
                row.map((number) => {
                  const color = getNumberColor(number);
                  const isSelected = selectedBetType === 'straight' && selectedBetValue === String(number);
                  const isResult = roundState?.phase === 'result' && roundState.result === number;
                  const isHighlighted = highlightedNumbers.has(number);

                  return (
                    <button
                      key={number}
                      onClick={() => onSelectBet('straight', String(number))}
                      className={`relative h-9 text-sm font-bold transition-all ${colorClass(color)} hover:opacity-80 ${
                        isSelected
                          ? 'ring-2 ring-[var(--rpg-gold)] ring-inset'
                          : isHighlighted
                            ? 'brightness-[1.35] ring-1 ring-[var(--rpg-gold)]/50 ring-inset'
                            : ''
                      } ${isResult ? 'ring-2 ring-[var(--rpg-gold)] animate-pulse' : ''}`}
                    >
                      {number}
                      {chipMap.has(`num:${number}`) && (
                        <ChipStackIndicator {...chipMap.get(`num:${number}`)!} />
                      )}
                    </button>
                  );
                }),
              )}
            </div>

            {CORNER_POSITIONS.map((corner) => (
              <button
                key={`corner-${corner.value}`}
                onClick={() => onSelectBet('corner', corner.value)}
                onMouseEnter={() => onSetHoveredBet({ type: 'corner', value: corner.value })}
                onMouseLeave={() => onSetHoveredBet(null)}
                className={`absolute w-5 h-5 rounded-full z-10 transition-colors ${
                  selectedBetType === 'corner' && selectedBetValue === corner.value
                    ? 'bg-[var(--rpg-gold)]/40 ring-1 ring-[var(--rpg-gold)]'
                    : 'hover:bg-[var(--rpg-gold)]/20'
                }`}
                style={{
                  left: `${((corner.col + 1) / 3) * 100}%`,
                  top: `${((corner.row + 1) / 12) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                title={`Corner: ${corner.numbers.join(', ')}`}
              >
                {chipMap.has(`corner:${corner.value}`) && (
                  <ChipStackIndicator {...chipMap.get(`corner:${corner.value}`)!} />
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 mt-1">
            {[1, 2, 3].map((column) => (
              <button
                key={`col-${column}`}
                onClick={() => onSelectBet('column', `col${column}`)}
                onMouseEnter={() => onSetHoveredBet({ type: 'column', value: `col${column}` })}
                onMouseLeave={() => onSetHoveredBet(null)}
                className={`relative h-8 text-xs font-semibold bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] rounded transition-all hover:bg-[var(--rpg-border)] ${
                  selectedBetType === 'column' && selectedBetValue === `col${column}`
                    ? 'border-[var(--rpg-gold)] ring-1 ring-[var(--rpg-gold)]'
                    : 'border-[var(--rpg-border)]'
                } border`}
              >
                Col {column}
                {chipMap.has(`column:col${column}`) && (
                  <ChipStackIndicator {...chipMap.get(`column:col${column}`)!} />
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 mt-1">
            {[
              { label: '1st 12', value: '1-12' },
              { label: '2nd 12', value: '13-24' },
              { label: '3rd 12', value: '25-36' },
            ].map(({ label, value }) => (
              <button
                key={`dozen-${value}`}
                onClick={() => onSelectBet('dozen', value)}
                onMouseEnter={() => onSetHoveredBet({ type: 'dozen', value })}
                onMouseLeave={() => onSetHoveredBet(null)}
                className={`relative h-8 text-xs font-semibold bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] rounded transition-all hover:bg-[var(--rpg-border)] ${
                  selectedBetType === 'dozen' && selectedBetValue === value
                    ? 'border-[var(--rpg-gold)] ring-1 ring-[var(--rpg-gold)]'
                    : 'border-[var(--rpg-border)]'
                } border`}
              >
                {label}
                {chipMap.has(`dozen:${value}`) && (
                  <ChipStackIndicator {...chipMap.get(`dozen:${value}`)!} />
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-1 mt-1">
            {([
              { label: 'Red', type: 'red' as const, value: 'red', cls: 'bg-[var(--rpg-red)] text-white' },
              { label: 'Black', type: 'black' as const, value: 'black', cls: 'bg-[#1a1a2e] text-white' },
              { label: 'Odd', type: 'odd' as const, value: 'odd', cls: 'bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)]' },
              { label: 'Even', type: 'even' as const, value: 'even', cls: 'bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)]' },
            ]).map(({ label, type, value, cls }) => (
              <button
                key={value}
                onClick={() => onSelectBet(type, value)}
                onMouseEnter={() => onSetHoveredBet({ type, value })}
                onMouseLeave={() => onSetHoveredBet(null)}
                className={`relative h-8 text-xs font-semibold ${cls} rounded transition-all hover:opacity-80 ${
                  selectedBetType === type && selectedBetValue === value
                    ? 'border-[var(--rpg-gold)] ring-1 ring-[var(--rpg-gold)]'
                    : 'border-[var(--rpg-border)]'
                } border`}
              >
                {label}
                {chipMap.has(`${type}:${value}`) && (
                  <ChipStackIndicator {...chipMap.get(`${type}:${value}`)!} />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {selectedBetType && (
          <div className="text-sm text-[var(--rpg-text-secondary)]">
            Selected:{' '}
            <span className="text-[var(--rpg-text-primary)] font-semibold">
              {formatBet(selectedBetType, selectedBetValue)}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-[var(--rpg-text-secondary)] mb-1 block">Bet Amount</label>
            <input
              type="number"
              min={CASINO_CONSTANTS.ROULETTE_MIN_BET}
              max={Math.min(CASINO_CONSTANTS.ROULETTE_MAX_BET, gold)}
              value={betAmount}
              onChange={(event) => onBetAmountChange(Math.max(1, parseInt(event.target.value, 10) || 0))}
              className="w-full px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-[12px] font-pixel"
            />
          </div>
          <div className="flex items-end gap-1">
            {[10, 50, 100].map((preset) => (
              <button
                key={preset}
                onClick={() => onBetAmountChange(Math.min(preset, gold))}
                className={`px-2 py-2 text-xs rounded border transition-all ${
                  betAmount === preset
                    ? 'border-[var(--rpg-gold)] text-[var(--rpg-gold)]'
                    : 'border-[var(--rpg-border)] text-[var(--rpg-text-secondary)] hover:border-[var(--rpg-text-secondary)]'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--rpg-text-secondary)]">
          <span>
            Bets:{' '}
            <span className={atMaxBets ? 'text-[var(--rpg-red)]' : 'text-[var(--rpg-text-primary)]'}>
              {myBetCount}/{CASINO_CONSTANTS.MAX_BETS_PER_ROUND}
            </span>
          </span>
          <span>
            Max per bet:{' '}
            <span className="text-[var(--rpg-text-primary)]">
              {CASINO_CONSTANTS.ROULETTE_MAX_BET.toLocaleString()}g
            </span>
          </span>
        </div>

        <PixelButton
          variant="gold"
          size="md"
          className="w-full"
          onClick={onPlaceBet}
          disabled={!canBet || isBetting}
        >
          {isBetting
            ? 'Placing Bet...'
            : roundState?.phase !== 'betting'
              ? 'Waiting for betting phase...'
              : atMaxBets
                ? `Max bets reached (${CASINO_CONSTANTS.MAX_BETS_PER_ROUND})`
                : !selectedBetType
                  ? 'Select a bet'
                  : betAmount > gold
                    ? 'Not enough gold'
                    : `Place Bet (${betAmount} gold)`}
        </PixelButton>
      </div>
    </PixelCard>
  );
}

function RoundPhaseIndicator({ phase, timeRemaining }: { phase: string; timeRemaining: number }) {
  switch (phase) {
    case 'betting':
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--rpg-green-light)] animate-pulse" />
          <span className="text-[12px] text-[var(--rpg-green-light)] font-pixel">{timeRemaining}s</span>
          <span className="text-xs text-[var(--rpg-text-secondary)]">betting open</span>
        </div>
      );
    case 'spinning':
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--rpg-gold)] animate-pulse" />
          <span className="text-xs text-[var(--rpg-gold)]">Spinning...</span>
        </div>
      );
    case 'result':
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--rpg-blue-light)]" />
          <span className="text-xs text-[var(--rpg-blue-light)]">Result</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--rpg-text-secondary)]" />
          <span className="text-xs text-[var(--rpg-text-secondary)]">Idle</span>
        </div>
      );
  }
}
