import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildProjectResponse, GuildProjectsListResponse } from '@/lib/api/guild';

const apiMocks = vi.hoisted(() => ({
  getGuildProjects: vi.fn(),
  startGuildProject: vi.fn(),
  contributeProjectTurns: vi.fn(),
  contributeProjectMaterials: vi.fn(),
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
  getInventory: vi.fn(),
}));

import { GuildProjectsTab } from './GuildProjectsTab';

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

const projectList: GuildProjectsListResponse = {
  projects: [activeWarRoom],
  available: [],
};

describe('GuildProjectsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getGuildProjects.mockResolvedValue({ data: projectList, error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it('disables guild-bank turn contribution when the guild treasury has no turns', async () => {
    render(
      <GuildProjectsTab
        guildId="guild-1"
        myRole="leader"
        guildTreasuryTurns={0}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Turns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guild bank' }));

    expect(screen.getByText('Amount (max 0 from guild bank)')).toBeTruthy();
    expect((screen.getByLabelText(/Amount \(max 0 from guild bank\)/i) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /^Contribute$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('submits the displayed guild-bank max when the current turn amount is higher', async () => {
    apiMocks.contributeProjectTurns.mockResolvedValue({ data: activeWarRoom, error: null });

    render(
      <GuildProjectsTab
        guildId="guild-1"
        myRole="leader"
        guildTreasuryTurns={500}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Contribute Turns' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guild bank' }));
    fireEvent.click(screen.getByRole('button', { name: /^Contribute$/ }));

    await waitFor(() => {
      expect(apiMocks.contributeProjectTurns).toHaveBeenCalledWith('guild-1', 'project-1', 500, 'guild');
    });
  });
});
