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
  adminGetBalanceReportMock,
  adminListSupportTicketsMock,
  adminUpdateSupportTicketMock,
} = vi.hoisted(() => ({
  adminGetSeasonsMock: vi.fn(),
  adminCreateSeasonMock: vi.fn(),
  adminBootstrapSeasonMock: vi.fn(),
  adminActivateSeasonMock: vi.fn(),
  adminEndSeasonMock: vi.fn(),
  adminEvaluateSeasonRewardsMock: vi.fn(),
  adminMergeSeasonMock: vi.fn(),
  adminGetBalanceReportMock: vi.fn(),
  adminListSupportTicketsMock: vi.fn(),
  adminUpdateSupportTicketMock: vi.fn(),
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
    adminGetBalanceReport: adminGetBalanceReportMock,
    adminListSupportTickets: adminListSupportTicketsMock,
    adminUpdateSupportTicket: adminUpdateSupportTicketMock,
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

const supportTickets = [
  {
    id: 'SUP-B0414A95',
    status: 'new',
    privacy: 'private',
    category: 'bug',
    area: 'combat',
    title: 'Testd',
    body: 'Testing 123e\n\nSteps: Test',
    reporter: { displayName: 'ZuKii', realm: 'Preseason', seasonId: null },
    context: { screen: 'explore', appVersion: '0.1.0' },
    sensitivityFlags: [],
    duplicateTicketIds: [],
    githubIssueUrl: null,
    staffNotes: 'Ask reporter which potion and acquisition path.',
    createdAt: '2026-06-01T20:37:10.643Z',
    updatedAt: '2026-06-01T20:37:10.643Z',
  },
  {
    id: 'SUP-1B10429D',
    status: 'new',
    privacy: 'private',
    category: 'bug',
    area: 'combat',
    title: 'Testd',
    body: 'Testing 123e\n\nSteps: Test',
    reporter: { displayName: 'ZuKii', realm: 'Season One', seasonId: 'season-1' },
    context: { screen: 'explore', appVersion: '0.1.0' },
    sensitivityFlags: [],
    duplicateTicketIds: [],
    githubIssueUrl: null,
    staffNotes: null,
    createdAt: '2026-06-01T20:37:15.271Z',
    updatedAt: '2026-06-01T20:37:15.271Z',
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

async function openSupportTab() {
  renderAdminScreen();
  fireEvent.click(screen.getByRole('button', { name: 'Support' }));
  await screen.findByRole('heading', { name: 'Support Triage' });
}

beforeEach(() => {
  adminGetSeasonsMock.mockResolvedValue({ data: { seasons }, error: null });
  adminCreateSeasonMock.mockResolvedValue({ data: { season: seasons[0] }, error: null });
  adminBootstrapSeasonMock.mockResolvedValue({ data: { message: 'Bootstrapped', seasonId: 'season-1' }, error: null });
  adminActivateSeasonMock.mockResolvedValue({ data: { season: seasons[0] }, error: null });
  adminEndSeasonMock.mockResolvedValue({ data: { message: 'Ended' }, error: null });
  adminEvaluateSeasonRewardsMock.mockResolvedValue({ data: { message: 'Evaluated', hallOfFameEntries: 12 }, error: null });
  adminMergeSeasonMock.mockResolvedValue({ data: { message: 'Merged', merged: 20, errors: [] }, error: null });
  adminListSupportTicketsMock.mockResolvedValue({ data: { tickets: supportTickets }, error: null });
  adminUpdateSupportTicketMock.mockResolvedValue({ data: { ticket: { publicId: 'SUP-1B10429D', status: 'duplicate' } }, error: null });
  adminGetBalanceReportMock.mockResolvedValue({
    data: {
      period: '7d',
      generatedAt: '2026-05-08T12:00:00.000Z',
      activePlayers: 85,
      onboarding: {
        newAccounts: 50,
        newPlayers: 45,
        activatedPlayers: 36,
        activationRate: 80,
        firstCombatPlayers: 30,
        firstGatheringPlayers: 24,
        firstCraftingPlayers: 12,
        firstExplorationPlayers: 32,
      },
      tutorial: {
        completed: 20,
        skipped: 4,
        inProgress: 10,
        notStarted: 8,
        completionRate: 48,
        byStep: { '0': 8, '7': 10, '13': 20, '-1': 4 },
      },
      retention: {
        activeInPeriod: 85,
        returningActivePlayers: 55,
        eligibleNewPlayers: 30,
        returnedNextDay: 12,
        nextDayRetentionRate: 40,
      },
      friction: {
        newPlayersWithoutActions: 9,
        activePlayersBelowLevel5: 22,
        staleTutorialPlayers: 6,
        deaths: {
          'Forest Edge / Wolf': { count: 7, uniquePlayers: 5 },
        },
      },
      skillDistribution: {},
      turnDistribution: {
        combat: { totalTurns: 500000, actionCount: 10000, avgTurnsPerAction: 50, uniquePlayers: 75 },
      },
      xpEfficiency: {},
      progressionVelocity: {},
      zoneActivity: {},
    },
    error: null,
  });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminScreen support tab', () => {
  it('loads support tickets and applies a duplicate decision', async () => {
    await openSupportTab();

    await waitFor(() => expect(adminListSupportTicketsMock).toHaveBeenCalledWith({
      status: 'new,needs_info',
      limit: 50,
    }));
    expect(screen.getByText('SUP-B0414A95')).toBeTruthy();
    expect(screen.getAllByText(/Testing 123e/)).toHaveLength(2);
    expect(screen.getByText('Saved staff notes')).toBeTruthy();
    expect(screen.getByText('Ask reporter which potion and acquisition path.')).toBeTruthy();

    const row = screen.getByTestId('support-ticket-SUP-1B10429D');
    fireEvent.change(within(row).getByLabelText('Status'), { target: { value: 'duplicate' } });
    fireEvent.change(within(row).getByLabelText('Duplicate ticket IDs'), { target: { value: 'SUP-B0414A95' } });
    fireEvent.change(within(row).getByLabelText('Staff note'), {
      target: { value: 'Duplicate test submission from repeated Send Report clicks.' },
    });
    fireEvent.click(within(row).getByRole('button', { name: 'Apply' }));

    await waitFor(() => expect(adminUpdateSupportTicketMock).toHaveBeenCalledWith('SUP-1B10429D', {
      status: 'duplicate',
      duplicateTicketIds: ['SUP-B0414A95'],
      githubIssueUrl: null,
      sensitivityFlags: [],
      note: 'Duplicate test submission from repeated Send Report clicks.',
    }));
    await waitFor(() => expect(adminListSupportTicketsMock).toHaveBeenCalledTimes(2));
  });

  it('applies pasted Codex JSONL decisions in bulk', async () => {
    await openSupportTab();

    fireEvent.change(screen.getByLabelText('Codex decisions JSONL'), {
      target: {
        value: [
          JSON.stringify({
            id: 'SUP-1B10429D',
            status: 'duplicate',
            duplicateTicketIds: ['SUP-B0414A95'],
            note: 'Duplicate test submission.',
          }),
          JSON.stringify({
            id: 'SUP-B0414A95',
            status: 'rejected',
            note: 'Test submission.',
          }),
        ].join('\n'),
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Codex Decisions' }));

    await waitFor(() => expect(adminUpdateSupportTicketMock).toHaveBeenCalledWith('SUP-1B10429D', {
      status: 'duplicate',
      duplicateTicketIds: ['SUP-B0414A95'],
      note: 'Duplicate test submission.',
    }));
    expect(adminUpdateSupportTicketMock).toHaveBeenCalledWith('SUP-B0414A95', {
      status: 'rejected',
      note: 'Test submission.',
    });
    await waitFor(() => expect(adminListSupportTicketsMock).toHaveBeenCalledTimes(2));
  });

  it('shows the Codex triage runbook and export command', async () => {
    await openSupportTab();

    expect(screen.getByText('Run support export')).toBeTruthy();
    expect(screen.getByText('npm --silent run support:export-new -w apps/api -- --limit 20')).toBeTruthy();
    expect(screen.getByText(/Paste Codex decision JSONL here, then apply it to update tickets/)).toBeTruthy();
  });
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

describe('AdminScreen analytics tab', () => {
  it('shows onboarding, retention, and friction metrics', async () => {
    renderAdminScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Analytics' }));

    await waitFor(() => expect(adminGetBalanceReportMock).toHaveBeenCalledWith('7d'));

    expect(screen.getByRole('heading', { name: 'Onboarding Funnel' })).toBeTruthy();
    expect(screen.getByText('New accounts')).toBeTruthy();
    expect(screen.getAllByText('Activated').length).toBeGreaterThan(0);
    expect(screen.getAllByText('80.0%').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Retention' })).toBeTruthy();
    expect(screen.getByText('Active in period')).toBeTruthy();
    expect(screen.getByText('Returning active')).toBeTruthy();
    expect(screen.getAllByText('Next-day retention').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Friction' })).toBeTruthy();
    expect(screen.getByText('No actions after signup')).toBeTruthy();
    expect(screen.getByText('Forest Edge / Wolf')).toBeTruthy();
  });
});
