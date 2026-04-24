import { History, Users } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import { CASINO_CONSTANTS, getNumberColor, type RouletteHistoryEntry, type RoulettePublicBet } from '@pocketrealm/shared';
import type { RouletteNumberStat } from '@/lib/api';
import type { SessionBet } from '@/hooks/useCasinoSocket';
import { colorClass, colorPipClass, formatBet } from './casinoUtils';

interface CasinoHistoryPanelsProps {
  displayBets: RoulettePublicBet[];
  sessionBets: SessionBet[];
  sessionProfit: number;
  history: RouletteHistoryEntry[];
  showHeatMap: boolean;
  numberStats: RouletteNumberStat[] | null;
  onToggleHeatMap: () => void;
}

export function CasinoHistoryPanels({
  displayBets,
  sessionBets,
  sessionProfit,
  history,
  showHeatMap,
  numberStats,
  onToggleHeatMap,
}: CasinoHistoryPanelsProps) {
  return (
    <>
      {displayBets.length > 0 && (
        <PixelCard>
          <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3 flex items-center gap-2">
            <Users size={18} />
            Live Bets ({displayBets.length})
          </h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {displayBets.map((bet, index) => (
              <div
                key={`${bet.playerName}-${index}`}
                className="flex items-center justify-between text-sm py-1 px-2 rounded bg-[var(--rpg-background)]"
              >
                <span className="text-[var(--rpg-text-primary)] font-almendra truncate mr-2">
                  {bet.playerName}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-[var(--rpg-text-secondary)]">
                    {formatBet(bet.betType, bet.betValue)}
                  </span>
                  <span className="font-pixel text-[12px] text-[var(--rpg-gold)]">{bet.amount}g</span>
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      )}

      {sessionBets.length > 0 && (
        <PixelCard>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-[var(--rpg-text-primary)] text-sm">My Bets</h3>
            <span
              className={`font-pixel text-[12px] ${
                sessionProfit >= 0 ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'
              }`}
            >
              {sessionProfit >= 0 ? '+' : ''}
              {sessionProfit.toLocaleString()}g
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {sessionBets.map((bet) => (
              <div
                key={bet.id}
                className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[var(--rpg-background)]"
              >
                <span className="text-[var(--rpg-text-secondary)]">
                  {formatBet(bet.betType, bet.betValue)}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--rpg-text-secondary)] font-pixel text-[8px]">{bet.amount}g</span>
                  {bet.payout === null ? (
                    <span className="text-[var(--rpg-text-secondary)] italic">pending...</span>
                  ) : bet.payout > 0 ? (
                    <span className="text-[var(--rpg-green-light)] font-pixel text-[8px]">
                      +{(bet.payout - bet.amount).toLocaleString()}g
                    </span>
                  ) : (
                    <span className="text-[var(--rpg-red)] font-pixel text-[8px]">
                      -{bet.amount.toLocaleString()}g
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      )}

      {history.length > 0 && (
        <PixelCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[var(--rpg-text-primary)] flex items-center gap-2">
              <History size={18} />
              Spin History
            </h3>
            <button
              onClick={onToggleHeatMap}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                showHeatMap
                  ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] border border-[var(--rpg-gold)]/40'
                  : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] border border-[var(--rpg-border)]'
              }`}
            >
              Hot/Cold
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {history.map((entry) => {
              const color = getNumberColor(entry.result);

              return (
                <div
                  key={entry.spinNumber}
                  className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${colorClass(color)}`}
                  title={`Spin #${entry.spinNumber}`}
                >
                  {entry.result}
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-3 text-xs text-[var(--rpg-text-secondary)]">
            <span className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${colorPipClass('red')}`} />
              <span className="font-pixel text-[8px]">
                {history.filter((entry) => getNumberColor(entry.result) === 'red').length}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${colorPipClass('black')}`} />
              <span className="font-pixel text-[8px]">
                {history.filter((entry) => getNumberColor(entry.result) === 'black').length}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${colorPipClass('green')}`} />
              <span className="font-pixel text-[8px]">
                {history.filter((entry) => getNumberColor(entry.result) === 'green').length}
              </span>
            </span>
          </div>
        </PixelCard>
      )}

      {showHeatMap && numberStats && (
        <PixelCard>
          <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3 text-sm">
            Hot / Cold{' '}
            <span className="text-[var(--rpg-text-secondary)] font-normal">
              (last {CASINO_CONSTANTS.ROULETTE_STATS_DEPTH} spins)
            </span>
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <CasinoHeatMapColumn label="Hot" textClass="text-orange-400">
              {numberStats
                .filter((stat) => stat.number > 0)
                .sort((left, right) => right.count - left.count)
                .slice(0, 10)
                .map((stat) => (
                  <CasinoHeatMapRow
                    key={`hot-${stat.number}`}
                    stat={stat}
                    accentClass="bg-orange-400"
                  />
                ))}
            </CasinoHeatMapColumn>
            <CasinoHeatMapColumn label="Cold" textClass="text-blue-400">
              {numberStats
                .filter((stat) => stat.number > 0)
                .sort((left, right) => left.count - right.count)
                .slice(0, 10)
                .map((stat) => (
                  <CasinoHeatMapRow
                    key={`cold-${stat.number}`}
                    stat={stat}
                    accentClass="bg-blue-400"
                  />
                ))}
            </CasinoHeatMapColumn>
          </div>
        </PixelCard>
      )}
    </>
  );
}

function CasinoHeatMapColumn({
  label,
  textClass,
  children,
}: {
  label: string;
  textClass: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className={`text-xs font-semibold mb-1.5 flex items-center gap-1 ${textClass}`}>
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function CasinoHeatMapRow({
  stat,
  accentClass,
}: {
  stat: RouletteNumberStat;
  accentClass: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold ${colorClass(getNumberColor(stat.number))}`}
      >
        {stat.number}
      </div>
      <div className="flex-1 h-1.5 rounded-full bg-[var(--rpg-border)] overflow-hidden">
        <div
          className={`h-full rounded-full ${accentClass}`}
          style={{
            width: `${Math.min(100, (stat.count / (CASINO_CONSTANTS.ROULETTE_STATS_DEPTH / 37)) * 50)}%`,
          }}
        />
      </div>
      <span className="text-[8px] font-pixel text-[var(--rpg-text-secondary)] w-4 text-right">
        {stat.count}
      </span>
    </div>
  );
}
