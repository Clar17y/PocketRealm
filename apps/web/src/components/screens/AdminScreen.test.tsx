import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminSeason } from '@/lib/api';

const {
  adminGetSeasonsMock,
  adminCreateSeasonMock,
  adminBootstrapSeasonMock,
  adminActivateSeasonMock,
  adminEndSeasonMock,
  adminEvaluateSeasonRewardsMock,
  adminMergeSeasonMock,
} = vi.hoisted(() => ({
  adminGetSeasonsMock: vi.fn(),
  adminCreateSeasonMock: vi.fn(),
  adminBootstrapSeasonMock: vi.fn(),
  adminActivateSeasonMock: vi.fn(),
  adminEndSeasonMock: vi.fn(),
  adminEvaluateSeasonRewardsMock: vi.fn(),
  adminMergeSeasonMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    adminGetSeasons: adminGetSeasonsMock,
    adminCreateSeason: adminCreateSeasonMock,
    adminBootstrapSeason: adminBootstrapSeasonMock,
    adminActivateSeason: adminActivateSeasonMock,
    adminEndSeason: adminEndSeasonMock,
    adminEvaluateSeasonRewards: adminEvaluateSeasonRewardsMock,
    adminMergeSeason: adminMergeSeasonMock,
    adminGetLatencyActions: vi.fn().mockResolvedValue({ data: { actions: [] } }),
    adminGetLatencyReport: vi.fn().mockResolvedValue({
      data: {
        period: '1h',
        bucketSizeSeconds: 60,
        generatedAt: '2026-05-09T10:00:00.000Z',
        actions: [],
        series: [],
      },
    }),
  };
});

import AdminScreen from './AdminScreen';

const seasons: AdminSeason[] = [
  {
    id: 'season-1',
    name: 'Season One',
    status: 'draft',
    startsAt: '2026-04-01T00:00:00.000Z',
    endsAt: '2026-04-30T00:00:00.000Z',
    createdAt: '2026-03-20T00:00:00.000Z',
    isBootstrapped: false,
  },
  {
    id: 'season-2',
    name: 'Season Two',
    status: 'active',
    startsAt: '2026-05-01T00:00:00.000Z',
    endsAt: '2026-05-31T00:00:00.000Z',
    createdAt: '2026-04-20T00:00:00.000Z',
    isBootstrapped: true,
  },
];

function renderAdminScreen() {
  return render(
    <AdminScreen
      onStateUpdates={vi.fn()}
      setTurns={vi.fn()}
      reloadZones={vi.fn().mockResolvedValue(undefined)}
    />,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

async function openSeasonsTab() {
  renderAdminScreen();
  fireEvent.click(screen.getByRole('button', { name: 'Seasons' }));
  await screen.findByRole('heading', { name: 'Create Season' });
}

beforeEach(() => {
  adminGetSeasonsMock.mockResolvedValue({ data: { seasons }, error: null });
  adminCreateSeasonMock.mockResolvedValue({ data: { season: seasons[0] }, error: null });
  adminBootstrapSeasonMock.mockResolvedValue({ data: { message: 'Bootstrapped', seasonId: 'season-1' }, error: null });
  adminActivateSeasonMock.mockResolvedValue({ data: { season: seasons[0] }, error: null });
  adminEndSeasonMock.mockResolvedValue({ data: { message: 'Ended' }, error: null });
  adminEvaluateSeasonRewardsMock.mockResolvedValue({ data: { message: 'Evaluated', hallOfFameEntries: 12 }, error: null });
  adminMergeSeasonMock.mockResolvedValue({ data: { message: 'Merged', merged: 20, errors: [] }, error: null });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminScreen seasons tab', () => {
  it('renders the new Seasons tab', () => {
    renderAdminScreen();

    expect(screen.getByRole('button', { name: 'Seasons' })).toBeTruthy();
  });

  it('loads season rows from adminGetSeasons', async () => {
    await openSeasonsTab();

    await waitFor(() => expect(adminGetSeasonsMock).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Season One')).toBeTruthy();
    expect(screen.getByText('Season Two')).toBeTruthy();
    expect(screen.getByTestId('season-row-season-1').textContent).toContain('draft');
    expect(screen.getByTestId('season-row-season-2').textContent).toContain('active');
  });

  it('shows a loading state while seasons are being fetched', async () => {
    const deferred = createDeferred<{ data: { seasons: AdminSeason[] }; error: null }>();
    adminGetSeasonsMock.mockReturnValueOnce(deferred.promise);

    renderAdminScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Seasons' }));

    expect(screen.getByText('Loading...')).toBeTruthy();

    deferred.resolve({ data: { seasons }, error: null });

    expect(await screen.findByText('Season One')).toBeTruthy();
  });

  it('creates a season and refreshes the list', async () => {
    await openSeasonsTab();

    const startsAt = '2026-06-01T00:00';
    const endsAt = '2026-06-30T00:00';

    fireEvent.change(screen.getByLabelText('Season name'), { target: { value: 'Season Three' } });
    fireEvent.change(screen.getByLabelText('Starts at'), { target: { value: startsAt } });
    fireEvent.change(screen.getByLabelText('Ends at'), { target: { value: endsAt } });
    fireEvent.change(screen.getByLabelText('Features'), { target: { value: 'leaderboards, rewards , merges' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Season' }));

    await waitFor(() => expect(adminCreateSeasonMock).toHaveBeenCalledWith({
      name: 'Season Three',
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      features: ['leaderboards', 'rewards', 'merges'],
    }));
    await waitFor(() => expect(adminGetSeasonsMock).toHaveBeenCalledTimes(2));
  });

  it('bootstraps an existing season and refreshes the list', async () => {
    adminGetSeasonsMock
      .mockResolvedValueOnce({ data: { seasons }, error: null })
      .mockResolvedValueOnce({ data: { seasons: seasons.map((season) => (
        season.id === 'season-1' ? { ...season, isBootstrapped: true } : season
      )) }, error: null });

    await openSeasonsTab();

    const row = screen.getByTestId('season-row-season-1');
    fireEvent.click(within(row).getByRole('button', { name: 'Bootstrap' }));

    await waitFor(() => expect(adminBootstrapSeasonMock).toHaveBeenCalledWith('season-1'));
    await waitFor(() => expect(adminGetSeasonsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('season-row-season-1').textContent).toContain('bootstrapped'));
  });

  it('refreshes the list after activating a season', async () => {
    adminGetSeasonsMock
      .mockResolvedValueOnce({ data: { seasons }, error: null })
      .mockResolvedValueOnce({ data: { seasons: seasons.map((season) => (
        season.id === 'season-1' ? { ...season, status: 'active' } : season
      )) }, error: null });

    await openSeasonsTab();

    const draftRow = screen.getByTestId('season-row-season-1');
    fireEvent.click(within(draftRow).getByRole('button', { name: 'Activate' }));

    await waitFor(() => expect(adminActivateSeasonMock).toHaveBeenCalledWith('season-1'));
    await waitFor(() => expect(adminGetSeasonsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('season-row-season-1').textContent).toContain('active'));
    expect(window.confirm).toHaveBeenCalledWith('Activate season "Season One"?');
  });

  it('refreshes the list after ending a season', async () => {
    adminGetSeasonsMock
      .mockResolvedValueOnce({ data: { seasons }, error: null })
      .mockResolvedValueOnce({ data: { seasons: seasons.map((season) => (
        season.id === 'season-2' ? { ...season, status: 'ended' } : season
      )) }, error: null });

    await openSeasonsTab();

    const activeRow = screen.getByTestId('season-row-season-2');

    fireEvent.click(within(activeRow).getByRole('button', { name: 'End Season' }));
    await waitFor(() => expect(adminEndSeasonMock).toHaveBeenCalledWith('season-2'));
    await waitFor(() => expect(adminGetSeasonsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('season-row-season-2').textContent).toContain('ended'));
    expect(window.confirm).toHaveBeenCalledWith('End season "Season Two"?');
  });

  it('refreshes the list after evaluating season rewards', async () => {
    const refreshedSeasons = seasons.map((season) => (
      season.id === 'season-2' ? { ...season, name: 'Season Two Reviewed' } : season
    ));
    adminGetSeasonsMock
      .mockResolvedValueOnce({ data: { seasons }, error: null })
      .mockResolvedValueOnce({ data: { seasons: refreshedSeasons }, error: null });

    await openSeasonsTab();

    const activeRow = screen.getByTestId('season-row-season-2');

    fireEvent.click(within(activeRow).getByRole('button', { name: 'Evaluate Rewards' }));
    await waitFor(() => expect(adminEvaluateSeasonRewardsMock).toHaveBeenCalledWith('season-2'));
    await waitFor(() => expect(adminGetSeasonsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Season Two Reviewed')).toBeTruthy());
    expect(window.confirm).toHaveBeenCalledWith('Evaluate rewards for "Season Two"?');
  });

  it('refreshes the list after merging a season', async () => {
    const refreshedSeasons = seasons.map((season) => (
      season.id === 'season-2' ? { ...season, name: 'Season Two Merged' } : season
    ));
    adminGetSeasonsMock
      .mockResolvedValueOnce({ data: { seasons }, error: null })
      .mockResolvedValueOnce({ data: { seasons: refreshedSeasons }, error: null });

    await openSeasonsTab();

    const activeRow = screen.getByTestId('season-row-season-2');

    fireEvent.click(within(activeRow).getByRole('button', { name: 'Merge Season' }));
    await waitFor(() => expect(adminMergeSeasonMock).toHaveBeenCalledWith('season-2'));
    await waitFor(() => expect(adminGetSeasonsMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('Season Two Merged')).toBeTruthy());
    expect(window.confirm).toHaveBeenCalledWith('Merge season "Season Two" into the permanent realm?');
  });
});
