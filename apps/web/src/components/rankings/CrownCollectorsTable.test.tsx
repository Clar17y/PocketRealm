import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CrownCollectorsTable } from './CrownCollectorsTable';
import type { CrownCollectorEntry } from '@/lib/api/social';

afterEach(() => {
  cleanup();
});

function collector(overrides: Partial<CrownCollectorEntry>): CrownCollectorEntry {
  return {
    rank: 1,
    username: 'Arden',
    characterLevel: 24,
    crowns: { gold: 2, silver: 1, bronze: 1, total: 4 },
    topGroups: [],
    ...overrides,
  };
}

describe('CrownCollectorsTable', () => {
  it('renders crown totals and pinned my rank', () => {
    render(
      <CrownCollectorsTable
        entries={[collector({ rank: 1, username: 'Arden' })]}
        myRank={collector({
          rank: 12,
          username: 'Me',
          characterLevel: 18,
          crowns: { gold: 1, silver: 1, bronze: 0, total: 2 },
        })}
        loading={false}
        totalPlayers={20}
        lastRefreshedAt={null}
        showAroundMe={false}
        onToggleAroundMe={vi.fn()}
      />,
    );

    expect(screen.getByText('20 collectors ranked')).toBeTruthy();
    expect(screen.getByText('Arden')).toBeTruthy();
    expect(screen.getByText('4 crowns')).toBeTruthy();
    expect(screen.getByText('#12')).toBeTruthy();
    expect(screen.getByText('Me')).toBeTruthy();
  });

  it('calls around-me toggle', () => {
    const onToggleAroundMe = vi.fn();

    render(
      <CrownCollectorsTable
        entries={[]}
        myRank={collector({ rank: 12, username: 'Me' })}
        loading={false}
        totalPlayers={20}
        lastRefreshedAt={null}
        showAroundMe={false}
        onToggleAroundMe={onToggleAroundMe}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View My Rank' }));

    expect(onToggleAroundMe).toHaveBeenCalledTimes(1);
  });
});
