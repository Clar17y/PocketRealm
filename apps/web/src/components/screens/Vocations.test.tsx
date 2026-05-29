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
      turnsSpent: 1200,
      turnsLimit: 10800,
      turnsRemaining: 9600,
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

  it('shows mechanical technique effects before learning', () => {
    render(
      <Vocations
        snapshot={snapshot()}
        availableTurns={5000}
        currentZoneName="Millbrook Market"
        currentZoneType="town"
        busyAction={null}
        onHone={vi.fn()}
        onLearnTechnique={vi.fn()}
        onRespec={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Bowyer' }));

    expect(screen.getByText(/applies tight string mark/i)).toBeTruthy();
    expect(screen.getByText(/\+4% ranged power/i)).toBeTruthy();
    expect(screen.getByText(/-2% accuracy/i)).toBeTruthy();
    expect(screen.getByText(/light attack, normal attack, skill attack: \+4% damage, \+8% durability wear/i)).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: /learn blood groove/i }));

    await waitFor(() => {
      expect(onLearnTechnique).toHaveBeenCalledWith('weaponsmith', 'weaponsmith_blood_groove');
    });
  });

  it('allows basic mentor actions for every vocation in Millbrook and blocks advanced techniques until Thornwall', () => {
    render(
      <Vocations
        snapshot={snapshot({
          vocations: [
            {
              vocationId: 'weaponsmith',
              xp: 6038,
              rank: 5,
              xpForCurrentRank: 6038,
              xpForNextRank: 10060,
              masteryPointsEarned: 4,
              availableMasteryPoints: 4,
              spentPoints: 0,
              learnedTechniqueIds: [],
            },
          ],
        })}
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

    expect((screen.getByRole('button', { name: /hone weaponsmith/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /learn keen edge/i }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole('button', { name: /learn crushing poll/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText(/advanced techniques require thornwall/i).length).toBeGreaterThan(0);
  });
});
