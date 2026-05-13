import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuildMemberResponse, GuildResponse, PlayerGuildResponse } from '@/lib/api';

const testState = vi.hoisted(() => ({
  getPlayerGuild: vi.fn(),
  guildMembersProps: vi.fn(),
  guildSettingsProps: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getPlayerGuild: testState.getPlayerGuild,
  };
});

vi.mock('@/components/guild/NoGuildView', () => ({
  NoGuildView: (props: { onGuildJoined: () => void }) => {
    return <button onClick={props.onGuildJoined}>Guild Joined</button>;
  },
}));

vi.mock('@/components/guild/GuildMembers', () => ({
  GuildMembers: (props: { onMembershipChanged?: () => void }) => {
    testState.guildMembersProps(props);
    return <button onClick={props.onMembershipChanged}>Guild Left</button>;
  },
}));

vi.mock('@/components/guild/GuildSettings', () => ({
  GuildSettings: (props: { onMembershipChanged?: () => void }) => {
    testState.guildSettingsProps(props);
    return <button onClick={props.onMembershipChanged}>Guild Disbanded</button>;
  },
}));

vi.mock('@/components/common/NpcDialogueBanner', () => ({
  NpcDialogueBanner: () => null,
}));

vi.mock('@/hooks/useNpcDialogue', () => ({
  useNpcDialogue: () => ({ dialogueEvent: null }),
}));

import { GuildScreen } from './GuildScreen';

const guild: GuildResponse = {
  id: 'guild-1',
  name: 'Realm Runners',
  tag: 'RUN',
  description: null,
  leaderId: 'p1',
  level: 3,
  xp: '1200',
  memberCount: 2,
  maxMembers: 20,
  recruitmentMode: 'open',
  minLevelRequirement: 10,
  taxRate: 5,
  specialization: null,
  renown: 12,
  seasonalRenown: 4,
  treasuryTurns: 1000,
  treasuryCap: 5000,
  createdAt: '2026-04-18T12:00:00.000Z',
};

const members: GuildMemberResponse[] = [
  {
    playerId: 'p1',
    username: 'Rook',
    role: 'member',
    characterLevel: 12,
    totalTurnsContributed: '0',
    joinedAt: '2026-04-18T12:00:00.000Z',
    lastActiveAt: null,
    isActive: true,
  },
];

const guildResponse: PlayerGuildResponse = {
  guild,
  role: 'member',
  members,
};

describe('GuildScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('notifies parent chat state after joining a guild from the no-guild view', async () => {
    const onGuildMembershipChange = vi.fn();
    testState.getPlayerGuild.mockResolvedValue({ data: null, error: null });

    render(
      <GuildScreen
        playerId="p1"
        characterLevel={12}
        onGuildMembershipChange={onGuildMembershipChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Guild Joined' }));

    expect(onGuildMembershipChange).toHaveBeenCalledTimes(1);
  });

  it('notifies parent chat state after leaving a guild from the members tab', async () => {
    const onGuildMembershipChange = vi.fn();
    testState.getPlayerGuild.mockResolvedValue({ data: guildResponse, error: null });

    render(
      <GuildScreen
        playerId="p1"
        characterLevel={12}
        onGuildMembershipChange={onGuildMembershipChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'members' }));
    await waitFor(() => expect(testState.guildMembersProps).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Guild Left' }));

    expect(onGuildMembershipChange).toHaveBeenCalledTimes(1);
  });

  it('notifies parent chat state after disbanding a guild from settings', async () => {
    const onGuildMembershipChange = vi.fn();
    testState.getPlayerGuild.mockResolvedValue({
      data: { ...guildResponse, role: 'leader' },
      error: null,
    });

    render(
      <GuildScreen
        playerId="p1"
        characterLevel={12}
        onGuildMembershipChange={onGuildMembershipChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'settings' }));
    await waitFor(() => expect(testState.guildSettingsProps).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Guild Disbanded' }));

    expect(onGuildMembershipChange).toHaveBeenCalledTimes(1);
  });
});
