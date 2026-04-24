import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Casino } from './Casino';

const { getRouletteRound, getRouletteHistory, getRouletteStats } = vi.hoisted(() => ({
  getRouletteRound: vi.fn(),
  getRouletteHistory: vi.fn(),
  getRouletteStats: vi.fn(),
}));

vi.mock('@/hooks/useNpcDialogue', () => ({
  useNpcDialogue: () => ({
    dialogueEvent: 'idle',
    triggerDialogueEvent: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  getRouletteRound,
  getRouletteHistory,
  getRouletteStats,
}));

describe('Casino', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRouletteRound.mockResolvedValue({
      data: {
        roundId: 'round-1',
        phase: 'betting',
        timeRemainingMs: 15000,
        result: null,
        bets: [],
      },
    });
    getRouletteHistory.mockResolvedValue({
      data: {
        history: [],
      },
    });
    getRouletteStats.mockResolvedValue({
      data: {
        stats: [],
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('selects a straight bet and places it against the current round', async () => {
    const onPlaceBet = vi.fn().mockResolvedValue(undefined);
    const trackBet = vi.fn();

    render(
      React.createElement(Casino, {
        gold: 250,
        turns: 500,
        onExchangeGold: vi.fn().mockResolvedValue(undefined),
        onPlaceBet,
        onGoldUpdate: vi.fn(),
        onTurnsUpdate: vi.fn(),
        isInTown: true,
        liveBets: [],
        sessionBets: [],
        sessionProfit: 0,
        lastResult: null,
        trackBet,
        playerName: 'Hero',
        showNpcDialogue: false,
      }),
    );

    await waitFor(() => {
      expect(getRouletteRound).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByRole('button', { name: '7' }));
    fireEvent.click(screen.getByRole('button', { name: /place bet \(10 gold\)/i }));

    await waitFor(() => {
      expect(onPlaceBet).toHaveBeenCalledWith('straight', '7', 10);
      expect(trackBet).toHaveBeenCalledWith('straight', '7', 10, 'round-1');
    });
  });
});
