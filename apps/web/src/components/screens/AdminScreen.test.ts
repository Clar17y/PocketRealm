import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminScreen from './AdminScreen';
import {
  adminGetMobFamilies,
  adminGetZones,
} from '@/lib/api';

vi.mock('@/lib/api', () => ({
  adminGrantTurns: vi.fn().mockResolvedValue({ data: { currentTurns: 5000 } }),
  adminSetLevel: vi.fn().mockResolvedValue({ data: { stateUpdates: {} } }),
  adminGrantXp: vi.fn().mockResolvedValue({ data: { stateUpdates: {} } }),
  adminSetAttributes: vi.fn().mockResolvedValue({ data: { stateUpdates: {} } }),
  adminSetSkillLevel: vi.fn().mockResolvedValue({ data: { stateUpdates: {} } }),
  adminSetSkillLevels: vi.fn().mockResolvedValue({ data: { stateUpdates: {} } }),
  adminGetItemTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
  adminGrantItem: vi.fn().mockResolvedValue({ data: { stateUpdates: {} } }),
  adminGetEventTemplates: vi.fn().mockResolvedValue({ data: { templates: [] } }),
  adminGetActiveEvents: vi.fn().mockResolvedValue({ data: { events: [] } }),
  adminSpawnEvent: vi.fn().mockResolvedValue({ data: {} }),
  adminCancelEvent: vi.fn().mockResolvedValue({ data: {} }),
  adminGetMobs: vi.fn().mockResolvedValue({ data: { mobs: [] } }),
  adminGetMobFamilies: vi.fn().mockResolvedValue({
    data: {
      families: [{ id: 'family-1', name: 'Rats' }],
    },
  }),
  adminSpawnBoss: vi.fn().mockResolvedValue({ data: {} }),
  adminGetZones: vi.fn().mockResolvedValue({
    data: {
      zones: [{ id: 'zone-1', name: 'Millbrook', difficulty: 1, zoneType: 'town' }],
    },
  }),
  adminDiscoverAllZones: vi.fn().mockResolvedValue({ data: {} }),
  adminTeleport: vi.fn().mockResolvedValue({ data: { stateUpdates: {} } }),
  adminSpawnEncounter: vi.fn().mockResolvedValue({ data: {} }),
  adminGetResourceNodes: vi.fn().mockResolvedValue({ data: { nodes: [] } }),
  adminSpawnResourceNode: vi.fn().mockResolvedValue({ data: {} }),
  adminGrantTokens: vi.fn().mockResolvedValue({ data: {} }),
  adminGrantGuildTreasury: vi.fn().mockResolvedValue({ data: {} }),
  adminResetExpeditionCooldowns: vi.fn().mockResolvedValue({ data: {} }),
  adminFillExpedition: vi.fn().mockResolvedValue({ data: {} }),
  adminGetBalanceReport: vi.fn().mockResolvedValue({
    data: {
      activePlayers: 0,
      skillDistribution: {},
      turnDistribution: {},
      xpEfficiency: {},
      progressionVelocity: {},
      zoneActivity: {},
    },
  }),
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
}));

describe('AdminScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the player tab by default and switches to the guild tab', async () => {
    render(React.createElement(AdminScreen, {
      onStateUpdates: vi.fn(),
      setTurns: vi.fn(),
      reloadZones: vi.fn().mockResolvedValue(undefined),
    }));

    expect(screen.getByRole('heading', { name: 'Admin Panel' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Turns' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Guild' }));

    expect(screen.getByRole('heading', { name: 'Guild Treasury' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Expedition Testing' })).toBeTruthy();
  });

  it('loads zone data when the zones tab is opened', async () => {
    render(React.createElement(AdminScreen, {
      onStateUpdates: vi.fn(),
      setTurns: vi.fn(),
      reloadZones: vi.fn().mockResolvedValue(undefined),
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Zones' }));

    await waitFor(() => {
      expect(adminGetZones).toHaveBeenCalledTimes(1);
      expect(adminGetMobFamilies).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('heading', { name: 'Spawn Encounter Site' })).toBeTruthy();
  });
});
