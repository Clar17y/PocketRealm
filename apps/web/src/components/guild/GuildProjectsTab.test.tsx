import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GuildProjectsTab } from './GuildProjectsTab';
import type { GuildProjectResponse, GuildProjectsListResponse } from '@/lib/api/guild';

const apiMocks = vi.hoisted(() => ({
  getGuildProjects: vi.fn(),
  startGuildProject: vi.fn(),
  contributeProjectTurns: vi.fn(),
  contributeProjectMaterials: vi.fn(),
  getInventory: vi.fn(),
}));

vi.mock('@/lib/api/guild', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/guild')>('@/lib/api/guild');
  return {
    ...actual,
    getGuildProjects: apiMocks.getGuildProjects,
    startGuildProject: apiMocks.startGuildProject,
    contributeProjectTurns: apiMocks.contributeProjectTurns,
    contributeProjectMaterials: apiMocks.contributeProjectMaterials,
  };
});

vi.mock('@/lib/api/items', () => ({
  getInventory: apiMocks.getInventory,
}));

const activeProject: GuildProjectResponse = {
  id: 'proj-1',
  projectKey: 'guild_forge',
  name: 'Guild Forge',
  description: 'Build a better forge.',
  level: 1,
  status: 'active',
  materialCosts: [{ category: 'ore', quantity: 1_000 }],
  materialsProgress: { ore: 500 },
  memberTurnGoal: 100_000,
  turnsContributed: 10_000,
  perks: [],
  startedAt: '2026-06-24T12:00:00.000Z',
  completedAt: null,
  contributions: [
    {
      playerId: 'player-1',
      username: 'Rook',
      turnsContributed: 49_500,
      materialsContributed: { ore: 190 },
    },
  ],
};

const activeWarRoom: GuildProjectResponse = {
  id: 'project-1',
  projectKey: 'war_room',
  name: 'War Room',
  description: 'A strategic planning center that sharpens combat skills.',
  level: 1,
  status: 'active',
  materialCosts: [],
  materialsProgress: {},
  memberTurnGoal: 150_000,
  turnsContributed: 50_000,
  perks: [{ effectType: 'xpBoost', value: 0.05 }],
  startedAt: '2026-06-23T08:00:00.000Z',
  completedAt: null,
};

function projectsResponse(project: GuildProjectResponse = activeProject): GuildProjectsListResponse {
  return { projects: [project], available: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderProjectsTab(overrides: Partial<React.ComponentProps<typeof GuildProjectsTab>> = {}) {
  return render(
    <GuildProjectsTab
      guildId="guild-1"
      myRole="member"
      playerId="player-1"
      {...overrides}
    />,
  );
}

describe('GuildProjectsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getGuildProjects.mockResolvedValue({ data: projectsResponse(), error: null });
    apiMocks.getInventory.mockResolvedValue({
      data: {
        items: [
          {
            id: 'item-1',
            templateId: 'tpl-iron-ore',
            quantity: 50,
            template: { id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource' },
          },
        ],
      },
      error: null,
    });
    apiMocks.contributeProjectTurns.mockResolvedValue({ data: activeProject, error: null });
    apiMocks.contributeProjectMaterials.mockResolvedValue({ data: activeProject, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('clamps turn contributions to the player remaining cap before submitting', async () => {
    renderProjectsTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Turns' }));
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Contribute$/ }));

    await waitFor(() => {
      expect(apiMocks.contributeProjectTurns).toHaveBeenCalledWith('guild-1', 'proj-1', 500, 'player');
    });
  });

  it('rejects partial numeric turn input instead of parsing a prefix', async () => {
    renderProjectsTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Turns' }));
    const amountInput = screen.getByLabelText(/amount/i) as HTMLInputElement;
    fireEvent.change(amountInput, { target: { value: '1e3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Contribute$/ }));

    expect(amountInput.value).toBe('');
    expect(apiMocks.contributeProjectTurns).not.toHaveBeenCalled();
  });

  it('disables contribution submits until the current player id is available', async () => {
    renderProjectsTab({ playerId: null });

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Turns' }));
    const turnSubmit = screen.getByRole('button', { name: /^Contribute$/ }) as HTMLButtonElement;
    expect(turnSubmit.disabled).toBe(true);
    fireEvent.click(turnSubmit);
    expect(apiMocks.contributeProjectTurns).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Contribute Materials' }));
    await screen.findByLabelText(/material/i);
    const materialSubmit = screen.getByRole('button', { name: /^Contribute$/ }) as HTMLButtonElement;
    expect(materialSubmit.disabled).toBe(true);
    fireEvent.click(materialSubmit);
    expect(apiMocks.contributeProjectMaterials).not.toHaveBeenCalled();
  });

  it('clamps material contributions to the selected category remaining cap before submitting', async () => {
    renderProjectsTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Materials' }));
    await screen.findByLabelText(/material/i);
    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: /^Contribute$/ }));

    await waitFor(() => {
      expect(apiMocks.contributeProjectMaterials).toHaveBeenCalledWith('guild-1', 'proj-1', 'tpl-iron-ore', 10);
    });
  });

  it('applies inventory state updates returned by material contribution responses', async () => {
    const stateUpdates = {
      inventoryRemoved: ['item-1'],
      inventoryUsedSlots: 2,
      materialTotals: { 'tpl-iron-ore': 0 },
    };
    const onStateUpdates = vi.fn();
    apiMocks.contributeProjectMaterials.mockResolvedValue({
      data: { ...activeProject, stateUpdates },
      error: null,
    });

    renderProjectsTab({ onStateUpdates });

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Materials' }));
    await screen.findByLabelText(/material/i);
    fireEvent.click(screen.getByRole('button', { name: /^Contribute$/ }));

    await waitFor(() => {
      expect(onStateUpdates).toHaveBeenCalledWith(stateUpdates);
    });
  });

  it('keeps material submit disabled until project contribution caps refresh', async () => {
    const refresh = deferred<{ data: GuildProjectsListResponse; error: null }>();
    apiMocks.getGuildProjects
      .mockResolvedValueOnce({ data: projectsResponse(), error: null })
      .mockReturnValueOnce(refresh.promise);

    renderProjectsTab();

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Materials' }));
    await screen.findByLabelText(/material/i);
    const submit = screen.getByRole('button', { name: /^Contribute$/ }) as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => {
      expect(apiMocks.getGuildProjects).toHaveBeenCalledTimes(2);
    });
    await Promise.resolve();
    await Promise.resolve();

    expect((screen.getByRole('button', { name: /^Contribute$/ }) as HTMLButtonElement).disabled).toBe(true);

    refresh.resolve({
      data: projectsResponse({
        ...activeProject,
        contributions: [
          {
            ...activeProject.contributions![0],
            materialsContributed: { ore: 191 },
          },
        ],
      }),
      error: null,
    });

    await waitFor(() => {
      expect((screen.getByRole('button', { name: /^Contribute$/ }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  it('disables guild-bank turn contribution when the guild treasury has no turns', async () => {
    apiMocks.getGuildProjects.mockResolvedValue({ data: projectsResponse(activeWarRoom), error: null });

    renderProjectsTab({
      myRole: 'leader',
      guildTreasuryTurns: 0,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Turns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guild bank' }));

    expect(screen.getByText('Amount (max 0 from guild bank; 50,000 per person)')).toBeTruthy();
    expect((screen.getByLabelText(/Amount \(max 0 from guild bank/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^Contribute$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits the displayed guild-bank max when the current turn amount is higher', async () => {
    apiMocks.getGuildProjects.mockResolvedValue({ data: projectsResponse(activeWarRoom), error: null });
    apiMocks.contributeProjectTurns.mockResolvedValue({ data: activeWarRoom, error: null });

    renderProjectsTab({
      myRole: 'leader',
      guildTreasuryTurns: 500,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Turns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guild bank' }));
    fireEvent.click(screen.getByRole('button', { name: /^Contribute$/ }));

    await waitFor(() => {
      expect(apiMocks.contributeProjectTurns).toHaveBeenCalledWith('guild-1', 'project-1', 500, 'guild');
    });
  });
});
