import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  getActiveEvents: vi.fn(),
  getActiveBossEncounters: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getActiveEvents: apiMocks.getActiveEvents,
    getActiveBossEncounters: apiMocks.getActiveBossEncounters,
  };
});

vi.mock('@/components/BossEncounterPanel', () => ({
  BossEncounterPanel: ({ encounterId, refreshSignal }: { encounterId: string; refreshSignal?: number }) => (
    <div data-testid="boss-encounter-panel">{encounterId}:{refreshSignal ?? 'none'}</div>
  ),
}));

import { getActiveBossEncounters, getActiveEvents } from '@/lib/api';
import { WorldEvents } from './WorldEvents';

const vexCampCopy = 'A travelling collector trades world boss trophies for rare gear, tempering, and boss stones.';
const activeBoss = {
  id: 'boss-1',
  eventId: 'event-1',
  mobTemplateId: 'mob-alpha',
  baseHp: 100,
  killedBy: null,
  mobName: 'Alpha Wolf',
  mobLevel: 7,
  zoneName: 'Moonlit Grove',
  currentHp: 50,
  maxHp: 100,
  roundNumber: 2,
  status: 'in_progress' as const,
  nextRoundAt: null,
};

function renderWorldEvents(onNavigate = vi.fn()) {
  render(
    <WorldEvents
      currentZoneId={null}
      currentZoneName={null}
      playerId="player-1"
      onNavigate={onNavigate}
    />,
  );
  return { onNavigate };
}

describe('WorldEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getActiveEvents).mockResolvedValue({ data: { events: [] } });
    vi.mocked(getActiveBossEncounters).mockResolvedValue({ data: { encounters: [] } });
  });

  afterEach(() => cleanup());

  it('shows Vex camp without active events or bosses and navigates to Vex', async () => {
    const { onNavigate } = renderWorldEvents();

    expect(await screen.findByText("Vex's Camp")).toBeTruthy();
    expect(screen.getByText(vexCampCopy)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Trade with Vex' }));

    expect(onNavigate).toHaveBeenCalledWith('vex');
  });

  it('keeps Vex camp visible when a boss encounter is active', async () => {
    vi.mocked(getActiveBossEncounters).mockResolvedValue({
      data: {
        encounters: [activeBoss],
      },
    });

    renderWorldEvents();

    await waitFor(() => expect(screen.getByText(/Alpha Wolf/)).toBeTruthy());
    expect(screen.getByText("Vex's Camp")).toBeTruthy();
  });

  it('signals an open boss detail panel when the Events refresh button is clicked', async () => {
    vi.mocked(getActiveBossEncounters).mockResolvedValue({
      data: { encounters: [activeBoss] },
    });

    renderWorldEvents();

    fireEvent.click(await screen.findByText(/Alpha Wolf/));
    expect(screen.getByTestId('boss-encounter-panel').textContent).toBe('boss-1:0');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(getActiveEvents).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getActiveBossEncounters).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('boss-encounter-panel').textContent).toBe('boss-1:1');
  });
});
