import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CombatScreen } from './CombatScreen';

const combatApiMocks = vi.hoisted(() => ({
  autoResolveEncounterRoom: vi.fn(),
  startEncounterRoom: vi.fn(),
  resolveEncounterRound: vi.fn(),
  abandonEncounterSite: vi.fn(),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
  trackOnce: vi.fn(),
}));

vi.mock('@/lib/assets', () => ({
  monsterImageSrc: vi.fn(() => ''),
}));

vi.mock('@/lib/combatShare', () => ({
  formatCombatShareText: vi.fn(() => ''),
  resolveMobMaxHp: vi.fn(() => 0),
}));

vi.mock('@/lib/format', () => ({
  relativeTime: vi.fn(() => 'just now'),
}));

vi.mock('@/components/KnockoutBanner', () => ({
  KnockoutBanner: () => <div>knockout-banner</div>,
}));

vi.mock('@/components/common/ResourceStatusBar', () => ({
  ResourceStatusBar: () => <div>resource-status</div>,
}));

vi.mock('@/components/common/LowHpWarningDialog', () => ({
  LowHpWarningDialog: () => null,
}));

vi.mock('@/components/combat/CombatLogEntry', () => ({
  CombatLogEntry: () => null,
}));

vi.mock('@/components/combat/CombatPlayback', () => ({
  CombatPlayback: () => null,
}));

vi.mock('@/components/combat/CombatRewardsSummary', () => ({
  CombatRewardsSummary: () => null,
}));

vi.mock('@/components/playback/PlaybackSurface', () => ({
  PlaybackSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/screens/CombatHistory', () => ({
  CombatHistory: () => <div>combat-history</div>,
}));

vi.mock('@/components/common/FightNavigationBar', () => ({
  FightNavigationBar: () => null,
}));

vi.mock('@/components/screens/BossHistory', () => ({
  BossHistory: () => <div>boss-history</div>,
}));

vi.mock('@/components/common/Pagination', () => ({
  Pagination: () => null,
}));

vi.mock('@/components/common/EventBadge', () => ({
  EventBadges: () => null,
}));

vi.mock('@/components/common/CopyButton', () => ({
  CopyButton: () => null,
}));

vi.mock('@/components/common/XpRateBadge', () => ({
  XpRateBadge: () => null,
}));

vi.mock('@/components/common/ScreenContainer', () => ({
  ScreenContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/common/SubNav', () => ({
  SubNav: () => null,
}));

vi.mock('@/components/encounter/EncounterSiteCombatView', () => ({
  EncounterSiteCombatView: ({
    currentRoom,
    onAutoResolve,
    onResolveRound,
    onAdvanceRoom,
  }: {
    currentRoom: number;
    onAutoResolve: () => Promise<unknown>;
    onResolveRound: (action: { action: string; targetMobSlot?: number }) => Promise<unknown>;
    onAdvanceRoom: () => Promise<unknown>;
  }) => (
    <div>
      <div>encounter-room-{currentRoom}</div>
      <button type="button" onClick={() => void onAutoResolve()}>
        auto-resolve
      </button>
      <button type="button" onClick={() => void onResolveRound({ action: 'template' })}>
        resolve-round
      </button>
      <button type="button" onClick={() => void onAdvanceRoom()}>
        advance-room
      </button>
    </div>
  ),
}));

vi.mock('@/lib/api/combat', () => combatApiMocks);

function buildProps(overrides: Partial<React.ComponentProps<typeof CombatScreen>> = {}): React.ComponentProps<typeof CombatScreen> {
  return {
    hpState: {
      currentHp: 90,
      maxHp: 100,
      regenPerSecond: 1,
      lastHpRegenAt: '2026-04-23T10:00:00.000Z',
      isRecovering: false,
      recoveryCost: null,
    },
    currentTurns: 100,
    currentZoneId: 'zone-1',
    pendingEncounters: [
      {
        encounterSiteId: 'site-1',
        zoneId: 'zone-1',
        zoneName: 'Forest Edge',
        mobFamilyId: 'family-1',
        mobFamilyName: 'Wolves',
        siteName: 'Wolf Den',
        size: 'small',
        totalMobs: 4,
        aliveMobs: 2,
        defeatedMobs: 2,
        decayedMobs: 0,
        nextMobTemplateId: 'mob-1',
        nextMobName: 'Wolf',
        nextMobPrefix: null,
        nextMobDisplayName: 'Wolf',
        discoveredAt: '2026-04-23T10:00:00.000Z',
        currentRoom: 1,
        totalRooms: 2,
        roomMobCounts: [
          { room: 1, alive: 0, total: 2 },
          { room: 2, alive: 2, total: 2 },
        ],
        currentRoomMobs: [
          { slot: 3, mobTemplateId: 'mob-1', name: 'Wolf', prefix: null, role: 'trash', hp: 20, maxHp: 20, status: 'alive' },
          { slot: 4, mobTemplateId: 'mob-1', name: 'Wolf', prefix: null, role: 'elite', hp: 20, maxHp: 20, status: 'alive' },
        ],
        eventModifiers: [],
        totalTurnCost: 5,
      },
    ],
    pendingEncountersLoading: false,
    pendingEncountersError: null,
    pendingEncounterPage: 1,
    pendingEncounterPagination: {
      page: 1,
      pageSize: 8,
      total: 1,
      totalPages: 1,
      hasNext: false,
      hasPrevious: false,
    },
    pendingEncounterFilters: { zones: [], mobs: [] },
    pendingEncounterZoneFilter: 'zone-1',
    pendingEncounterMobFilter: 'all',
    pendingEncounterSort: 'danger',
    pendingClockMs: Date.now(),
    busyAction: null,
    lastCombat: null,
    bestiaryMobs: [],
    onPendingEncounterPageChange: vi.fn(),
    onPendingEncounterZoneFilterChange: vi.fn(),
    onPendingEncounterMobFilterChange: vi.fn(),
    onPendingEncounterSortChange: vi.fn(),
    templates: [],
    onActivateTemplate: vi.fn(),
    onStateUpdates: vi.fn(),
    updateQuestProgress: vi.fn(),
    refreshPendingEncounters: vi.fn().mockResolvedValue([
      {
        encounterSiteId: 'site-1',
        zoneId: 'zone-1',
        zoneName: 'Forest Edge',
        mobFamilyId: 'family-1',
        mobFamilyName: 'Wolves',
        siteName: 'Wolf Den',
        size: 'small',
        totalMobs: 4,
        aliveMobs: 2,
        defeatedMobs: 2,
        decayedMobs: 0,
        nextMobTemplateId: 'mob-1',
        nextMobName: 'Wolf',
        nextMobPrefix: null,
        nextMobDisplayName: 'Wolf',
        discoveredAt: '2026-04-23T10:00:00.000Z',
        currentRoom: 2,
        totalRooms: 2,
        roomMobCounts: [
          { room: 1, alive: 0, total: 2 },
          { room: 2, alive: 2, total: 2 },
        ],
        currentRoomMobs: [
          { slot: 3, mobTemplateId: 'mob-1', name: 'Wolf', prefix: null, role: 'trash', hp: 20, maxHp: 20, status: 'alive' },
          { slot: 4, mobTemplateId: 'mob-1', name: 'Wolf', prefix: null, role: 'elite', hp: 20, maxHp: 20, status: 'alive' },
        ],
        eventModifiers: [],
        totalTurnCost: 5,
      },
    ]),
    setError: vi.fn(),
    activeEncounterSiteId: null,
    onActiveEncounterSiteIdChange: vi.fn(),
    staminaState: { current: 80, max: 100, regenPerSecond: 1 },
    manaState: { current: 40, max: 50, regenPerSecond: 1 },
    ...overrides,
  };
}

describe('CombatScreen encounter site locking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    combatApiMocks.startEncounterRoom.mockResolvedValue({
      currentRoom: 1,
      totalRooms: 2,
      mobs: [],
      playerState: { hp: 90, maxHp: 100, stamina: 80, maxStamina: 100, mana: 40, maxMana: 50, activeEffects: [] },
      roundNumber: 0,
      roundLogs: [],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not mark a site active just for opening the room preview', () => {
    const props = buildProps();

    render(<CombatScreen {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fight' }));

    expect(props.onActiveEncounterSiteIdChange).not.toHaveBeenCalledWith('site-1');
    expect(screen.getByText('encounter-room-1')).toBeTruthy();
  });

  it('refreshes the next-room preview instead of starting room combat early', async () => {
    const props = buildProps();

    render(<CombatScreen {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fight' }));
    fireEvent.click(screen.getByRole('button', { name: 'advance-room' }));

    await waitFor(() => {
      expect(props.refreshPendingEncounters).toHaveBeenCalled();
    });

    expect(props.refreshPendingEncounters).toHaveBeenCalledWith({ includeEncounterSiteId: 'site-1' });
    expect(combatApiMocks.startEncounterRoom).not.toHaveBeenCalled();
  });

  it('updates quest progress from encounter-site auto-resolve responses', async () => {
    const questProgress = [
      { questId: 'weekly-kills', questName: 'Weekly Bounty', current: 1, target: 75, completed: false },
    ];
    combatApiMocks.autoResolveEncounterRoom.mockResolvedValue({
      outcome: 'cleared',
      rounds: [],
      initialMobs: [],
      questProgress,
      stateUpdates: {},
      skillXpGrants: [],
      fleeResult: null,
      respawnedTo: null,
    });
    const props = buildProps();

    render(<CombatScreen {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fight' }));
    fireEvent.click(screen.getByRole('button', { name: 'auto-resolve' }));

    await waitFor(() => {
      expect(props.updateQuestProgress).toHaveBeenCalledWith(questProgress);
    });
  });

  it('updates quest progress from manual encounter-site round responses', async () => {
    const questProgress = [
      { questId: 'weekly-kills', questName: 'Weekly Bounty', current: 1, target: 75, completed: false },
    ];
    combatApiMocks.resolveEncounterRound.mockResolvedValue({
      roundNumber: 1,
      roundLog: { round: 1, phases: { playerAttacks: [], defences: [], mobActions: [], healing: [], effectTicks: [], outcome: {} }, telegraphs: [] },
      mobStates: [],
      playerState: { hp: 90, maxHp: 100, stamina: 80, maxStamina: 100, mana: 40, maxMana: 50, activeEffects: [] },
      outcome: 'cleared',
      siteCleared: false,
      questProgress,
      stateUpdates: {},
      skillXpGrants: [],
      fleeResult: null,
      respawnedTo: null,
    });
    const props = buildProps();

    render(<CombatScreen {...props} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fight' }));
    fireEvent.click(screen.getByRole('button', { name: 'resolve-round' }));

    await waitFor(() => {
      expect(props.updateQuestProgress).toHaveBeenCalledWith(questProgress);
    });
  });
});
