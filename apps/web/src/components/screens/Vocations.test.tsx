import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VocationSnapshotResponse } from '@pocketrealm/shared';
import { Vocations } from './Vocations';

afterEach(() => {
  cleanup();
});

function snapshot(overrides: Partial<VocationSnapshotResponse> = {}): VocationSnapshotResponse {
  return {
    playerId: 'player-1',
    vocations: [
      {
        vocationId: 'weaponsmith',
        xp: 300,
        rank: 2,
        xpForCurrentRank: 300,
        xpForNextRank: 900,
        masteryPointsEarned: 1,
        availableMasteryPoints: 1,
        spentPoints: 0,
        learnedTechniqueIds: [],
      },
      {
        vocationId: 'prospector',
        xp: 0,
        rank: 1,
        xpForCurrentRank: 0,
        xpForNextRank: 300,
        masteryPointsEarned: 0,
        availableMasteryPoints: 0,
        spentPoints: 0,
        learnedTechniqueIds: [],
      },
    ],
    dailyCap: {
      dayStart: '2026-05-21T00:00:00.000Z',
      turnsSpent: 20,
      turnsLimit: 100,
      turnsRemaining: 80,
    },
    ...overrides,
  };
}

describe('Vocations screen', () => {
  it('hones the selected vocation with capped turns', async () => {
    const onHone = vi.fn().mockResolvedValue(undefined);

    render(
      <Vocations
        snapshot={snapshot()}
        availableTurns={50}
        currentZoneName="Thornwall Keep"
        currentZoneType="town"
        busyAction={null}
        onHone={onHone}
        onLearnTechnique={vi.fn()}
        onRespec={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Weaponsmith' }));
    fireEvent.change(screen.getByLabelText('Honing turns'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: /hone weaponsmith/i }));

    await waitFor(() => {
      expect(onHone).toHaveBeenCalledWith('weaponsmith', 30);
    });
  });

  it('learns an available technique and shows learned marks', async () => {
    const onLearnTechnique = vi.fn().mockResolvedValue(undefined);

    render(
      <Vocations
        snapshot={snapshot({
          vocations: [
            {
              vocationId: 'weaponsmith',
              xp: 5400,
              rank: 6,
              xpForCurrentRank: 300,
              xpForNextRank: 6300,
              masteryPointsEarned: 6,
              availableMasteryPoints: 2,
              spentPoints: 0,
              learnedTechniqueIds: [],
            },
          ],
        })}
        availableTurns={50}
        currentZoneName="Thornwall Keep"
        currentZoneType="town"
        busyAction={null}
        onHone={vi.fn()}
        onLearnTechnique={onLearnTechnique}
        onRespec={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /learn blood groove mark/i }));

    await waitFor(() => {
      expect(onLearnTechnique).toHaveBeenCalledWith('weaponsmith', 'weaponsmith_blood_groove');
    });
  });

  it('blocks mentor actions outside the selected vocation mentor town', () => {
    render(
      <Vocations
        snapshot={snapshot()}
        availableTurns={50}
        currentZoneName="Millbrook"
        currentZoneType="town"
        busyAction={null}
        onHone={vi.fn()}
        onLearnTechnique={vi.fn()}
        onRespec={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Weaponsmith' }));

    expect((screen.getByRole('button', { name: /hone weaponsmith/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/mentor: thornwall/i)).toBeTruthy();
  });
});
