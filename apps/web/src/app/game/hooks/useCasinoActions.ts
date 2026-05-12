import { useCallback } from 'react';
import { exchangeGold, placeRouletteBet } from '@/lib/api';
import type { RouletteBetType } from '@pocketrealm/shared';

interface UseCasinoActionsParams {
  setGold: (gold: number) => void;
  setTurns: (turns: number) => void;
}

export function useCasinoActions({ setGold, setTurns }: UseCasinoActionsParams) {
  const handleExchangeGold = useCallback(async (turnAmount: number) => {
    const result = await exchangeGold(turnAmount);
    if (result.data) {
      setGold(result.data.goldBalance);
      setTurns(result.data.turnsRemaining);
    }
  }, [setGold, setTurns]);

  const handlePlaceBet = useCallback(async (betType: RouletteBetType, betValue: string, amount: number) => {
    const result = await placeRouletteBet(betType, betValue, amount);
    if (result.data) {
      setGold(result.data.goldRemaining);
    }
  }, [setGold]);

  return { handleExchangeGold, handlePlaceBet };
}
