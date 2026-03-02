'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getSocket } from '@/lib/socket';
import type {
  CasinoPhaseEvent,
  CasinoBetEvent,
  CasinoResultEvent,
  RoulettePublicBet,
  RouletteBetType,
} from '@adventure/shared';
import { CASINO_CONSTANTS, CHAT_CONSTANTS, getNumberColor } from '@adventure/shared';

export interface SessionBet {
  id: string;
  betType: RouletteBetType;
  betValue: string;
  amount: number;
  roundId: string;
  payout: number | null; // null = pending
}

export interface DealerMessage {
  id: string;
  text: string;
  timestamp: number;
}

export interface UseCasinoSocketReturn {
  liveBets: RoulettePublicBet[];
  sessionBets: SessionBet[];
  sessionProfit: number;
  dealerMessages: DealerMessage[];
  lastResult: CasinoResultEvent | null;
  phase: CasinoPhaseEvent['phase'] | null;
  trackBet: (betType: RouletteBetType, betValue: string, amount: number, roundId: string) => void;
}

export function useCasinoSocket(
  active: boolean,
  playerId: string | null,
): UseCasinoSocketReturn {
  const [liveBets, setLiveBets] = useState<RoulettePublicBet[]>([]);
  const [sessionBets, setSessionBets] = useState<SessionBet[]>([]);
  const [dealerMessages, setDealerMessages] = useState<DealerMessage[]>([]);
  const [lastResult, setLastResult] = useState<CasinoResultEvent | null>(null);
  const [phase, setPhase] = useState<CasinoPhaseEvent['phase'] | null>(null);
  const roundIdRef = useRef<string | null>(null);

  const addDealerMsg = useCallback((text: string) => {
    setDealerMessages((prev) => [
      ...prev.slice(-(CHAT_CONSTANTS.HISTORY_LIMIT - 1)),
      { id: crypto.randomUUID(), text, timestamp: Date.now() },
    ]);
  }, []);

  const sessionProfit = useMemo(
    () => sessionBets.reduce((sum, b) => {
      if (b.payout === null) return sum;
      return sum + (b.payout - b.amount);
    }, 0),
    [sessionBets],
  );

  useEffect(() => {
    if (!active) return;

    const socket = getSocket();

    const onPhase = (e: CasinoPhaseEvent) => {
      setPhase(e.phase);
      roundIdRef.current = e.roundId;

      if (e.phase === 'betting') {
        setLiveBets(e.bets ?? []);
        setLastResult(null);
        addDealerMsg(`Place your bets! ${CASINO_CONSTANTS.BETTING_WINDOW_SECONDS} seconds remaining.`);
      } else if (e.phase === 'spinning') {
        addDealerMsg('No more bets. The wheel is spinning...');
      }
    };

    const onBet = (e: CasinoBetEvent) => {
      setLiveBets((prev) => [...prev, {
        playerName: e.playerName,
        betType: e.betType,
        betValue: e.betValue,
        amount: e.amount,
      }]);
    };

    const onResult = (e: CasinoResultEvent) => {
      setLastResult(e);
      const color = getNumberColor(e.result);
      const colorLabel = color === 'green' ? 'Green' : color === 'red' ? 'Red' : 'Black';
      addDealerMsg(`The ball lands on ${e.result} ${colorLabel}!`);

      // Big winner callouts
      for (const wb of e.winningBets) {
        if (wb.payout >= CASINO_CONSTANTS.BIG_WIN_THRESHOLD) {
          addDealerMsg(`${wb.playerName} wins ${wb.payout.toLocaleString()}g on a ${wb.betType} bet!`);
        }
      }

      // Resolve session bets for this round — match on betType + betValue + amount
      setSessionBets((prev) =>
        prev.map((b) => {
          if (b.payout !== null || b.roundId !== roundIdRef.current) return b;
          const myWin = e.winningBets.find(
            (wb) => wb.betType === b.betType && wb.betValue === b.betValue && wb.amount === b.amount,
          );
          return { ...b, payout: myWin ? myWin.payout : 0 };
        }),
      );
    };

    socket.on('casino:phase', onPhase);
    socket.on('casino:bet', onBet);
    socket.on('casino:result', onResult);

    return () => {
      socket.off('casino:phase', onPhase);
      socket.off('casino:bet', onBet);
      socket.off('casino:result', onResult);
    };
  }, [active, addDealerMsg]);

  const trackBet = useCallback(
    (betType: RouletteBetType, betValue: string, amount: number, roundId: string) => {
      setSessionBets((prev) => [
        { id: crypto.randomUUID(), betType, betValue, amount, roundId, payout: null },
        ...prev,
      ].slice(0, 50));
    },
    [],
  );

  return { liveBets, sessionBets, sessionProfit, dealerMessages, lastResult, phase, trackBet };
}
