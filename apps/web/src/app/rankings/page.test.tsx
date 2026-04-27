import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { publicRankingsMock } = vi.hoisted(() => ({
  publicRankingsMock: vi.fn(({ initialTab }: { initialTab?: string }) => (
    React.createElement('div', null, `public rankings component ${initialTab ?? 'none'}`)
  )),
}));

vi.mock('@/components/rankings/PublicRankings', () => ({
  PublicRankings: publicRankingsMock,
}));

import RankingsPage from './page';

describe('RankingsPage', () => {
  beforeEach(() => {
    publicRankingsMock.mockClear();
  });

  it('renders the public rankings component', async () => {
    const element = await RankingsPage({});

    render(element);
    expect(screen.getByText(/public rankings component/)).toBeTruthy();
  });

  it('passes a valid query tab to the public rankings component', async () => {
    const element = await RankingsPage({ searchParams: Promise.resolve({ tab: 'weekly' }) });

    render(element);
    expect(publicRankingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ initialTab: 'weekly' }),
      expect.anything(),
    );
  });
});
