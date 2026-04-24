'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { Coins } from 'lucide-react';
import { FirstVisitHowTo } from '@/components/common/FirstVisitHowTo';
import { NpcDialogueBanner } from '@/components/common/NpcDialogueBanner';
import { useNpcDialogue } from '@/hooks/useNpcDialogue';
import {
  CASINO_CONSTANTS,
  getNumbersForBet,
} from '@pocketrealm/shared';
import type {
  RouletteBetType,
  RoulettePublicBet,
  CasinoResultEvent,
} from '@pocketrealm/shared';
import type { SessionBet } from '@/hooks/useCasinoSocket';
import { ScreenContainer } from '../common/ScreenContainer';
import { GoldExchangeCard } from './casino/GoldExchangeCard';
import { RouletteBoardCard } from './casino/RouletteBoardCard';
import { CasinoHistoryPanels } from './casino/CasinoHistoryPanels';
import { useRouletteRound } from './casino/useRouletteRound';
import { buildChipMap, type SelectedRouletteBet } from './casino/casinoUtils';
import { WinCelebration } from './casino/WinCelebration';

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
  showNpcDialogue?: boolean;
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
  showNpcDialogue = true,
}: CasinoProps) {
  const { dialogueEvent, triggerDialogueEvent } = useNpcDialogue();
  const {
    roundState,
    history,
    showHeatMap,
    setShowHeatMap,
    numberStats,
    refreshRound,
  } = useRouletteRound();

  const [exchangeTurns, setExchangeTurns] = useState(100);
  const [isExchanging, setIsExchanging] = useState(false);
  const [selectedBetType, setSelectedBetType] = useState<RouletteBetType | null>(null);
  const [selectedBetValue, setSelectedBetValue] = useState('');
  const [betAmount, setBetAmount] = useState(10);
  const [isBetting, setIsBetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredBet, setHoveredBet] = useState<SelectedRouletteBet | null>(null);
  const [winAnimation, setWinAnimation] = useState<{ payout: number; isBigWin: boolean } | null>(null);

  const highlightedNumbers = useMemo(() => {
    const bet = hoveredBet ?? (selectedBetType ? { type: selectedBetType, value: selectedBetValue } : null);
    if (!bet) return new Set<number>();
    return getNumbersForBet(bet.type, bet.value);
  }, [hoveredBet, selectedBetType, selectedBetValue]);

  const displayBets = useMemo(() => {
    const polled = roundState?.bets ?? [];
    if (liveBets.length === 0) return polled;
    if (polled.length === 0) return liveBets;

    return liveBets.length > polled.length ? [...polled, ...liveBets.slice(polled.length)] : polled;
  }, [liveBets, roundState?.bets]);

  const chipMap = useMemo(() => buildChipMap(displayBets, playerName), [displayBets, playerName]);

  const lastResultRef = useRef<typeof lastResult>(null);
  useEffect(() => {
    if (!lastResult || lastResult === lastResultRef.current) return;
    lastResultRef.current = lastResult;
    const myWinnings = lastResult.winningBets
      .filter((wb) => wb.playerName === playerName)
      .reduce((sum, wb) => sum + wb.payout, 0);
    if (myWinnings > 0) {
      setWinAnimation({
        payout: myWinnings,
        isBigWin: myWinnings >= CASINO_CONSTANTS.BIG_WIN_THRESHOLD,
      });
      triggerDialogueEvent('buy');
      const timer = setTimeout(() => setWinAnimation(null), 2500);
      return () => clearTimeout(timer);
    } else {
      const myBets = sessionBets.filter((b) => b.payout === 0 || (b.payout !== null && b.payout < b.amount));
      if (myBets.length > 0) {
        triggerDialogueEvent('sell');
      }
    }
  }, [lastResult, playerName, sessionBets, triggerDialogueEvent]);

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

  const handleSelectBet = (type: RouletteBetType, value: string) => {
    setSelectedBetType(type);
    setSelectedBetValue(value);
    setError(null);
  };

  const handlePlaceBet = async () => {
    if (!selectedBetType || betAmount <= 0 || betAmount > gold) return;
    setIsBetting(true);
    setError(null);
    try {
      await onPlaceBet(selectedBetType, selectedBetValue, betAmount);
      trackBet(selectedBetType, selectedBetValue, betAmount, roundState?.roundId ?? '');
      await refreshRound();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bet');
    }
    setIsBetting(false);
  };

  const myBetCount = useMemo(() => displayBets.filter((b) => b.playerName === playerName).length, [displayBets, playerName]);
  const atMaxBets = myBetCount >= CASINO_CONSTANTS.MAX_BETS_PER_ROUND;

  if (!isInTown) {
    return (
      <PixelCard>
        <div className="text-center py-8">
          <Coins size={48} className="mx-auto mb-4 text-[var(--rpg-text-secondary)]" />
          <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)] mb-2">Casino</h2>
          <p className="text-[var(--rpg-text-secondary)]">
            You must be in a town to visit the casino.
          </p>
        </div>
      </PixelCard>
    );
  }

  return (
    <ScreenContainer>
      {winAnimation && <WinCelebration {...winAnimation} />}
      <NpcDialogueBanner npcKey="millbrook-casino" event={dialogueEvent} showDialogue={showNpcDialogue} />
      <FirstVisitHowTo
        storageKey="howto_casino"
        title="Casino"
        sections={[
          { heading: 'Gold Exchange', text: 'Convert your turns into gold at a 1:1 rate. Gold is used to place bets.' },
          { heading: 'Roulette', text: 'Pick a number, colour, or group and place your bet before the timer runs out. The wheel spins every 60 seconds.' },
          { heading: 'Payouts', text: 'Straight number pays 36:1, corner (4 numbers) 9:1, column/dozen 3:1, and colour/odd/even 2:1.' },
          { heading: 'Chat', text: 'The Casino chat tab lets you talk with other players at the table. The dealer announces results and big wins.' },
        ]}
      />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Coins size={28} className="text-[var(--rpg-gold)]" />
          <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Casino</h2>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Coins size={16} className="text-[var(--rpg-gold)]" />
          <span className="text-[var(--rpg-gold)] font-pixel text-[12px]">{gold.toLocaleString()}</span>
          <span className="text-[var(--rpg-text-secondary)]">gold</span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="text-[var(--rpg-red)] text-sm bg-[var(--rpg-red)]/10 border border-[var(--rpg-red)]/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <GoldExchangeCard
        turns={turns}
        exchangeTurns={exchangeTurns}
        isExchanging={isExchanging}
        onExchangeTurnsChange={setExchangeTurns}
        onExchange={handleExchange}
      />
      <RouletteBoardCard
        roundState={roundState}
        selectedBetType={selectedBetType}
        selectedBetValue={selectedBetValue}
        betAmount={betAmount}
        gold={gold}
        isBetting={isBetting}
        atMaxBets={atMaxBets}
        myBetCount={myBetCount}
        highlightedNumbers={highlightedNumbers}
        chipMap={chipMap}
        onSelectBet={handleSelectBet}
        onSetHoveredBet={setHoveredBet}
        onBetAmountChange={setBetAmount}
        onPlaceBet={() => void handlePlaceBet()}
      />
      <CasinoHistoryPanels
        displayBets={displayBets}
        sessionBets={sessionBets}
        sessionProfit={sessionProfit}
        history={history}
        showHeatMap={showHeatMap}
        numberStats={numberStats}
        onToggleHeatMap={() => setShowHeatMap(!showHeatMap)}
      />
    </ScreenContainer>
  );
}
