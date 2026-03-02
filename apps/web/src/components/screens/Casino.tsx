'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { Coins, Clock, History, Users } from 'lucide-react';
import * as api from '@/lib/api';
import {
  CASINO_CONSTANTS,
  getNumberColor,
  getNumbersForBet,
} from '@adventure/shared';
import type {
  RouletteBetType,
  RouletteRoundState,
  RouletteHistoryEntry,
  RoulettePublicBet,
  CasinoResultEvent,
} from '@adventure/shared';
import type { SessionBet } from '@/hooks/useCasinoSocket';

interface CasinoProps {
  gold: number;
  turns: number;
  onExchangeGold: (turns: number) => Promise<void>;
  onPlaceBet: (betType: RouletteBetType, betValue: string, amount: number) => Promise<void>;
  onGoldUpdate: (gold: number) => void;
  onTurnsUpdate: (turns: number) => void;
  isInTown: boolean;
  liveBets: RoulettePublicBet[];
  sessionBets: SessionBet[];
  sessionProfit: number;
  lastResult: CasinoResultEvent | null;
  trackBet: (betType: RouletteBetType, betValue: string, amount: number, roundId: string) => void;
  playerName: string | null;
}

// Helpers

function colorClass(color: 'red' | 'black' | 'green'): string {
  switch (color) {
    case 'red': return 'bg-[var(--rpg-red)] text-white';
    case 'black': return 'bg-[#1a1a2e] text-white';
    case 'green': return 'bg-[var(--rpg-green-dark)] text-white';
  }
}

function colorPipClass(color: 'red' | 'black' | 'green'): string {
  switch (color) {
    case 'red': return 'bg-[var(--rpg-red)]';
    case 'black': return 'bg-[#1a1a2e]';
    case 'green': return 'bg-[var(--rpg-green-dark)]';
  }
}

interface ChipStack {
  myAmount: number;
  myCount: number;
  otherCount: number;
}

function ChipStackIndicator({ myCount, otherCount, myAmount }: ChipStack) {
  const total = Math.min(myCount + otherCount, 4);
  if (total === 0) return null;
  const overflow = myCount + otherCount > 4 ? myCount + otherCount : 0;

  return (
    <div className="absolute bottom-0 right-0.5 flex flex-col-reverse items-center pointer-events-none">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`w-3 h-1.5 rounded-full border -mt-0.5 first:mt-0 ${
            i < myCount
              ? 'bg-[var(--rpg-gold)] border-[var(--rpg-gold)]/70'
              : 'bg-gray-400 border-gray-500'
          }`}
        />
      ))}
      {overflow > 0 && <span className="text-[6px] text-white font-bold">x{overflow}</span>}
      {myAmount > 0 && <span className="text-[6px] text-[var(--rpg-gold)] font-bold">{myAmount}g</span>}
    </div>
  );
}

function WinCelebration({ payout, isBigWin }: { payout: number; isBigWin: boolean }) {
  const coinCount = isBigWin ? 20 : 8;
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--rpg-gold)]/10" style={{ animation: 'gold-shimmer 1.5s ease-out forwards' }} />
      {Array.from({ length: coinCount }, (_, i) => (
        <div
          key={i}
          className="absolute text-lg"
          style={{
            left: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 0.8}s`,
            animation: `coin-fall ${1.5 + Math.random()}s ease-in forwards`,
          }}
        >
          {'🪙'}
        </div>
      ))}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-2xl font-bold text-[var(--rpg-gold)] animate-bounce">
          +{payout.toLocaleString()}g
        </div>
      </div>
    </div>
  );
}

// Build the roulette board rows: 12 rows of [col1, col2, col3]
const BOARD_ROWS: number[][] = [];
for (let row = 0; row < 12; row++) {
  BOARD_ROWS.push([row * 3 + 1, row * 3 + 2, row * 3 + 3]);
}

// Corner bet positions: each corner sits at the intersection of 4 adjacent numbers
const CORNER_POSITIONS: { row: number; col: number; value: string; numbers: number[] }[] = [];
for (let row = 0; row < 11; row++) {
  const topLeft = row * 3 + 1;
  CORNER_POSITIONS.push({
    row, col: 0,
    value: `${topLeft},${topLeft + 1},${topLeft + 3},${topLeft + 4}`,
    numbers: [topLeft, topLeft + 1, topLeft + 3, topLeft + 4],
  });
  CORNER_POSITIONS.push({
    row, col: 1,
    value: `${topLeft + 1},${topLeft + 2},${topLeft + 4},${topLeft + 5}`,
    numbers: [topLeft + 1, topLeft + 2, topLeft + 4, topLeft + 5],
  });
}

export function Casino({
  gold,
  turns,
  onExchangeGold,
  onPlaceBet,
  onGoldUpdate,
  onTurnsUpdate,
  isInTown,
  liveBets,
  sessionBets,
  sessionProfit,
  lastResult,
  trackBet,
  playerName,
}: CasinoProps) {
  // Gold exchange state
  const [exchangeTurns, setExchangeTurns] = useState(100);
  const [isExchanging, setIsExchanging] = useState(false);

  // Roulette state
  const [roundState, setRoundState] = useState<RouletteRoundState | null>(null);
  const [selectedBetType, setSelectedBetType] = useState<RouletteBetType | null>(null);
  const [selectedBetValue, setSelectedBetValue] = useState('');
  const [betAmount, setBetAmount] = useState(10);
  const [isBetting, setIsBetting] = useState(false);
  const [history, setHistory] = useState<RouletteHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBet, setHoveredBet] = useState<{ type: RouletteBetType; value: string } | null>(null);
  const [showHeatMap, setShowHeatMap] = useState(false);
  const [winAnimation, setWinAnimation] = useState<{ payout: number; isBigWin: boolean } | null>(null);

  const highlightedNumbers = useMemo(() => {
    const bet = hoveredBet ?? (selectedBetType ? { type: selectedBetType, value: selectedBetValue } : null);
    if (!bet) return new Set<number>();
    return getNumbersForBet(bet.type, bet.value);
  }, [hoveredBet, selectedBetType, selectedBetValue]);

  const chipMap = useMemo(() => {
    const bets = liveBets.length > 0 ? liveBets : (roundState?.bets ?? []);
    const map = new Map<string, ChipStack>();
    for (const bet of bets) {
      const key = bet.betType === 'straight' ? `num:${bet.betValue}`
        : bet.betType === 'corner' ? `corner:${bet.betValue}`
        : `${bet.betType}:${bet.betValue}`;
      const isMine = bet.playerName === playerName;
      const existing = map.get(key) ?? { myAmount: 0, myCount: 0, otherCount: 0 };
      if (isMine) {
        existing.myAmount += bet.amount;
        existing.myCount++;
      } else {
        existing.otherCount++;
      }
      map.set(key, existing);
    }
    return map;
  }, [liveBets, roundState?.bets, playerName]);

  const heatMap = useMemo(() => {
    if (!showHeatMap) return null;
    const counts = new Map<number, number>();
    for (const entry of history) {
      counts.set(entry.result, (counts.get(entry.result) ?? 0) + 1);
    }
    return counts;
  }, [history, showHeatMap]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch round state
  const fetchRound = useCallback(async () => {
    const result = await api.getRouletteRound();
    if (result.data) {
      setRoundState(result.data);
    }
  }, []);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    const result = await api.getRouletteHistory();
    if (result.data) {
      setHistory(result.data.history);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchRound();
    fetchHistory();
  }, [fetchRound, fetchHistory]);

  // Polling: every 3s during betting/spinning, after a delay during result to auto-start next round
  useEffect(() => {
    const phase = roundState?.phase;
    const interval = phase === 'result' ? 5000 : 3000;
    const shouldPoll = phase === 'betting' || phase === 'spinning' || phase === 'result';

    if (shouldPoll) {
      pollRef.current = setInterval(() => {
        fetchRound();
      }, interval);
    }

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [roundState?.phase, fetchRound]);

  // When result phase appears, refresh history
  useEffect(() => {
    if (roundState?.phase === 'result') {
      fetchHistory();
    }
  }, [roundState?.phase, fetchHistory]);

  // Win animation trigger
  useEffect(() => {
    if (!lastResult) return;
    const myWinnings = sessionBets
      .filter((b) => b.payout !== null && b.payout > 0)
      .reduce((sum, b) => sum + (b.payout ?? 0), 0);
    if (myWinnings > 0) {
      setWinAnimation({
        payout: myWinnings,
        isBigWin: myWinnings >= CASINO_CONSTANTS.BIG_WIN_THRESHOLD,
      });
      setTimeout(() => setWinAnimation(null), 2500);
    }
  }, [lastResult, sessionBets]);

  // Gold exchange handler
  const handleExchange = async () => {
    if (exchangeTurns <= 0 || exchangeTurns > turns) return;
    setIsExchanging(true);
    setError(null);
    try {
      await onExchangeGold(exchangeTurns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Exchange failed');
    }
    setIsExchanging(false);
  };

  // Select a number for straight bet
  const handleNumberClick = (n: number) => {
    setSelectedBetType('straight');
    setSelectedBetValue(String(n));
    setError(null);
  };

  // Select an outside bet
  const handleOutsideBet = (type: RouletteBetType, value: string) => {
    setSelectedBetType(type);
    setSelectedBetValue(value);
    setError(null);
  };

  // Place bet handler
  const handlePlaceBet = async () => {
    if (!selectedBetType || betAmount <= 0 || betAmount > gold) return;
    setIsBetting(true);
    setError(null);
    try {
      await onPlaceBet(selectedBetType, selectedBetValue, betAmount);
      trackBet(selectedBetType, selectedBetValue, betAmount, roundState?.roundId ?? '');
      // Refresh round after bet
      await fetchRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bet');
    }
    setIsBetting(false);
  };

  const canBet = roundState?.phase === 'betting' && selectedBetType && betAmount > 0 && betAmount <= gold;

  // Countdown display
  const timeRemaining = roundState?.timeRemainingMs
    ? Math.max(0, Math.ceil(roundState.timeRemainingMs / 1000))
    : 0;

  if (!isInTown) {
    return (
      <PixelCard>
        <div className="text-center py-8">
          <Coins size={48} className="mx-auto mb-4 text-[var(--rpg-text-secondary)]" />
          <h2 className="text-xl font-bold text-[var(--rpg-text-primary)] mb-2">Casino</h2>
          <p className="text-[var(--rpg-text-secondary)]">
            You must be in a town to visit the casino.
          </p>
        </div>
      </PixelCard>
    );
  }

  return (
    <div className="space-y-4">
      {winAnimation && <WinCelebration {...winAnimation} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Coins size={28} className="text-[var(--rpg-gold)]" />
          <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Casino</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Coins size={16} className="text-[var(--rpg-gold)]" />
          <span className="font-bold text-[var(--rpg-gold)] font-mono">{gold.toLocaleString()}</span>
          <span className="text-[var(--rpg-text-secondary)]">gold</span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="text-[var(--rpg-red)] text-sm bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {/* Gold Exchange */}
      <PixelCard>
        <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3 flex items-center gap-2">
          <Coins size={18} className="text-[var(--rpg-gold)]" />
          Gold Exchange
        </h3>
        <div className="flex items-center gap-2 text-xs text-[var(--rpg-text-secondary)] mb-3">
          <span>Rate: {CASINO_CONSTANTS.GOLD_EXCHANGE_RATE} turn = {CASINO_CONSTANTS.GOLD_EXCHANGE_RATE} gold</span>
          <span className="mx-1">|</span>
          <span>{turns.toLocaleString()} turns available</span>
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            min={1}
            max={turns}
            value={exchangeTurns}
            onChange={(e) => setExchangeTurns(Math.max(1, parseInt(e.target.value) || 0))}
            className="flex-1 px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm font-mono"
            placeholder="Turns to exchange"
          />
          <PixelButton
            variant="gold"
            size="sm"
            onClick={handleExchange}
            disabled={isExchanging || exchangeTurns <= 0 || exchangeTurns > turns}
          >
            {isExchanging ? 'Exchanging...' : `Exchange for ${(exchangeTurns * CASINO_CONSTANTS.GOLD_EXCHANGE_RATE).toLocaleString()} gold`}
          </PixelButton>
        </div>
      </PixelCard>

      {/* Round State */}
      <PixelCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-[var(--rpg-text-primary)] flex items-center gap-2">
            <Clock size={18} />
            Roulette
          </h3>
          <RoundPhaseIndicator phase={roundState?.phase ?? 'idle'} timeRemaining={timeRemaining} />
        </div>

        {/* Result display */}
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

        {/* Spinning animation */}
        {roundState?.phase === 'spinning' && (
          <div className="text-center py-6 mb-3">
            <div className="animate-spin inline-block w-12 h-12 rounded-full border-4 border-[var(--rpg-border)] border-t-[var(--rpg-gold)]" />
            <div className="text-sm text-[var(--rpg-text-secondary)] mt-2 animate-pulse">
              Spinning...
            </div>
          </div>
        )}

        {/* Roulette Board */}
        <div className="overflow-x-auto">
          <div className="min-w-[280px]">
            {/* Zero */}
            <button
              onClick={() => handleNumberClick(0)}
              className={`w-full h-9 rounded-t-lg text-sm font-bold transition-all border-2 ${
                selectedBetType === 'straight' && selectedBetValue === '0'
                  ? 'border-[var(--rpg-gold)] ring-2 ring-[var(--rpg-gold)]/50'
                  : 'border-transparent'
              } ${colorClass('green')} hover:opacity-80`}
            >
              0
            </button>

            {/* Number grid: 12 rows x 3 cols */}
            <div className="relative">
              <div className="grid grid-cols-3 gap-px bg-[var(--rpg-border)]">
                {BOARD_ROWS.map((row) =>
                  row.map((n) => {
                    const color = getNumberColor(n);
                    const isSelected = selectedBetType === 'straight' && selectedBetValue === String(n);
                    const isResult = roundState?.phase === 'result' && roundState.result === n;
                    const isHighlighted = highlightedNumbers.has(n);
                    const heat = heatMap?.get(n);
                    const heatClass = heatMap != null && !isSelected && !isHighlighted
                      ? (heat ?? 0) === 0
                        ? 'ring-1 ring-blue-400/40 ring-inset'
                        : (heat ?? 0) >= 2
                          ? 'ring-1 ring-orange-400/50 ring-inset'
                          : ''
                      : '';
                    return (
                      <button
                        key={n}
                        onClick={() => handleNumberClick(n)}
                        className={`relative h-9 text-sm font-bold transition-all ${colorClass(color)} hover:opacity-80 ${
                          isSelected
                            ? 'ring-2 ring-[var(--rpg-gold)] ring-inset'
                            : isHighlighted
                              ? 'brightness-[1.35] ring-1 ring-[var(--rpg-gold)]/50 ring-inset'
                              : heatClass
                        } ${
                          isResult
                            ? 'ring-2 ring-[var(--rpg-gold)] animate-pulse'
                            : ''
                        }`}
                      >
                        {n}
                        {chipMap.has(`num:${n}`) && <ChipStackIndicator {...chipMap.get(`num:${n}`)!} />}
                      </button>
                    );
                  })
                )}
              </div>
              {/* Corner bet hit targets */}
              {CORNER_POSITIONS.map((corner) => (
                <button
                  key={`corner-${corner.value}`}
                  onClick={() => handleOutsideBet('corner', corner.value)}
                  onMouseEnter={() => setHoveredBet({ type: 'corner', value: corner.value })}
                  onMouseLeave={() => setHoveredBet(null)}
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
                />
              ))}
            </div>

            {/* Column bets */}
            <div className="grid grid-cols-3 gap-1 mt-1">
              {[1, 2, 3].map((col) => (
                <button
                  key={`col-${col}`}
                  onClick={() => handleOutsideBet('column', `col${col}`)}
                  onMouseEnter={() => setHoveredBet({ type: 'column', value: `col${col}` })}
                  onMouseLeave={() => setHoveredBet(null)}
                  className={`relative h-8 text-xs font-semibold bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] rounded transition-all hover:bg-[var(--rpg-border)] ${
                    selectedBetType === 'column' && selectedBetValue === `col${col}`
                      ? 'border-[var(--rpg-gold)] ring-1 ring-[var(--rpg-gold)]'
                      : 'border-[var(--rpg-border)]'
                  } border`}
                >
                  Col {col}
                  {chipMap.has(`column:col${col}`) && <ChipStackIndicator {...chipMap.get(`column:col${col}`)!} />}
                </button>
              ))}
            </div>

            {/* Dozen bets */}
            <div className="grid grid-cols-3 gap-1 mt-1">
              {[
                { label: '1st 12', value: '1-12' },
                { label: '2nd 12', value: '13-24' },
                { label: '3rd 12', value: '25-36' },
              ].map(({ label, value }) => (
                <button
                  key={`dozen-${value}`}
                  onClick={() => handleOutsideBet('dozen', value)}
                  onMouseEnter={() => setHoveredBet({ type: 'dozen', value })}
                  onMouseLeave={() => setHoveredBet(null)}
                  className={`relative h-8 text-xs font-semibold bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)] rounded transition-all hover:bg-[var(--rpg-border)] ${
                    selectedBetType === 'dozen' && selectedBetValue === value
                      ? 'border-[var(--rpg-gold)] ring-1 ring-[var(--rpg-gold)]'
                      : 'border-[var(--rpg-border)]'
                  } border`}
                >
                  {label}
                  {chipMap.has(`dozen:${value}`) && <ChipStackIndicator {...chipMap.get(`dozen:${value}`)!} />}
                </button>
              ))}
            </div>

            {/* Even-money bets */}
            <div className="grid grid-cols-4 gap-1 mt-1">
              {([
                { label: 'Red', type: 'red' as RouletteBetType, value: 'red', cls: 'bg-[var(--rpg-red)] text-white' },
                { label: 'Black', type: 'black' as RouletteBetType, value: 'black', cls: 'bg-[#1a1a2e] text-white' },
                { label: 'Odd', type: 'odd' as RouletteBetType, value: 'odd', cls: 'bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)]' },
                { label: 'Even', type: 'even' as RouletteBetType, value: 'even', cls: 'bg-[var(--rpg-surface)] text-[var(--rpg-text-primary)]' },
              ]).map(({ label, type, value, cls }) => (
                <button
                  key={value}
                  onClick={() => handleOutsideBet(type, value)}
                  onMouseEnter={() => setHoveredBet({ type, value })}
                  onMouseLeave={() => setHoveredBet(null)}
                  className={`relative h-8 text-xs font-semibold ${cls} rounded transition-all hover:opacity-80 ${
                    selectedBetType === type && selectedBetValue === value
                      ? 'border-[var(--rpg-gold)] ring-1 ring-[var(--rpg-gold)]'
                      : 'border-[var(--rpg-border)]'
                  } border`}
                >
                  {label}
                  {chipMap.has(`${type}:${value}`) && <ChipStackIndicator {...chipMap.get(`${type}:${value}`)!} />}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bet Controls */}
        <div className="mt-4 space-y-3">
          {/* Selected bet display */}
          {selectedBetType && (
            <div className="text-sm text-[var(--rpg-text-secondary)]">
              Selected: <span className="text-[var(--rpg-text-primary)] font-semibold">{formatBet(selectedBetType, selectedBetValue)}</span>
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
                onChange={(e) => setBetAmount(Math.max(1, parseInt(e.target.value) || 0))}
                className="w-full px-3 py-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] text-[var(--rpg-text-primary)] text-sm font-mono"
              />
            </div>
            <div className="flex items-end gap-1">
              {[10, 50, 100].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setBetAmount(Math.min(preset, gold))}
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

          <PixelButton
            variant="gold"
            size="md"
            className="w-full"
            onClick={handlePlaceBet}
            disabled={!canBet || isBetting}
          >
            {isBetting
              ? 'Placing Bet...'
              : roundState?.phase !== 'betting'
                ? 'Waiting for betting phase...'
                : !selectedBetType
                  ? 'Select a bet'
                  : betAmount > gold
                    ? 'Not enough gold'
                    : `Place Bet (${betAmount} gold)`}
          </PixelButton>
        </div>
      </PixelCard>

      {/* Live Bets */}
      {(() => {
        const displayBets = liveBets.length > 0 ? liveBets : (roundState?.bets ?? []);
        if (displayBets.length === 0) return null;
        return (
          <PixelCard>
            <h3 className="font-semibold text-[var(--rpg-text-primary)] mb-3 flex items-center gap-2">
              <Users size={18} />
              Live Bets ({displayBets.length})
            </h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {displayBets.map((bet, i) => (
                <div
                  key={`${bet.playerName}-${i}`}
                  className="flex items-center justify-between text-sm py-1 px-2 rounded bg-[var(--rpg-background)]"
                >
                  <span className="text-[var(--rpg-text-primary)] truncate mr-2">{bet.playerName}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs text-[var(--rpg-text-secondary)]">
                      {formatBet(bet.betType, bet.betValue)}
                    </span>
                    <span className="font-mono text-[var(--rpg-gold)]">{bet.amount}g</span>
                  </div>
                </div>
              ))}
            </div>
          </PixelCard>
        );
      })()}

      {/* Session Bet History */}
      {sessionBets.length > 0 && (
        <PixelCard>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-[var(--rpg-text-primary)] text-sm">My Bets</h3>
            <span className={`font-mono text-sm font-bold ${
              sessionProfit >= 0 ? 'text-[var(--rpg-green-light)]' : 'text-[var(--rpg-red)]'
            }`}>
              {sessionProfit >= 0 ? '+' : ''}{sessionProfit.toLocaleString()}g
            </span>
          </div>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {sessionBets.map((bet) => (
              <div key={bet.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[var(--rpg-background)]">
                <span className="text-[var(--rpg-text-secondary)]">{formatBet(bet.betType, bet.betValue)}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[var(--rpg-text-secondary)] font-mono">{bet.amount}g</span>
                  {bet.payout === null ? (
                    <span className="text-[var(--rpg-text-secondary)] italic">pending...</span>
                  ) : bet.payout > 0 ? (
                    <span className="text-[var(--rpg-green-light)] font-mono font-bold">+{(bet.payout - bet.amount).toLocaleString()}g</span>
                  ) : (
                    <span className="text-[var(--rpg-red)] font-mono font-bold">-{bet.amount.toLocaleString()}g</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PixelCard>
      )}

      {/* Spin History */}
      {history.length > 0 && (
        <PixelCard>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[var(--rpg-text-primary)] flex items-center gap-2">
              <History size={18} />
              Spin History
            </h3>
            <button
              onClick={() => setShowHeatMap((v) => !v)}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                showHeatMap
                  ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)]'
                  : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
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
          {/* Color distribution */}
          <div className="flex items-center gap-3 mt-3 text-xs text-[var(--rpg-text-secondary)]">
            <span className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${colorPipClass('red')}`} />
              {history.filter((h) => getNumberColor(h.result) === 'red').length}
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${colorPipClass('black')}`} />
              {history.filter((h) => getNumberColor(h.result) === 'black').length}
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-full ${colorPipClass('green')}`} />
              {history.filter((h) => getNumberColor(h.result) === 'green').length}
            </span>
          </div>
        </PixelCard>
      )}

    </div>
  );
}

// Sub-components

function RoundPhaseIndicator({ phase, timeRemaining }: { phase: string; timeRemaining: number }) {
  switch (phase) {
    case 'betting':
      return (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--rpg-green-light)] animate-pulse" />
          <span className="text-sm text-[var(--rpg-green-light)] font-mono">{timeRemaining}s</span>
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

function formatBet(type: RouletteBetType, value: string): string {
  switch (type) {
    case 'straight': return `#${value}`;
    case 'red': return 'Red';
    case 'black': return 'Black';
    case 'odd': return 'Odd';
    case 'even': return 'Even';
    case 'dozen':
      return value === '1-12' ? '1st 12' : value === '13-24' ? '2nd 12' : '3rd 12';
    case 'column': return `Column ${value.replace('col', '')}`;
    case 'corner': return `Corner ${value}`;
    case 'split': return `Split ${value}`;
    default: return `${type} ${value}`;
  }
}
