import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  pushMock,
  logoutMock,
  refreshPlayerMock,
  storeTokensMock,
  loadAllMock,
  setActiveScreenMock,
  useAuthMock,
  useGameControllerMock,
  joinSeasonMock,
  switchPlayerMock,
  getCharactersMock,
  getSeasonArchivesMock,
  getActiveSeasonMock,
  refreshGuildChatMock,
  gameScreenRendererPropsMock,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  logoutMock: vi.fn(),
  refreshPlayerMock: vi.fn(),
  storeTokensMock: vi.fn(),
  loadAllMock: vi.fn(),
  setActiveScreenMock: vi.fn(),
  useAuthMock: vi.fn(),
  useGameControllerMock: vi.fn(),
  joinSeasonMock: vi.fn(),
  switchPlayerMock: vi.fn(),
  getCharactersMock: vi.fn(),
  getSeasonArchivesMock: vi.fn(),
  getActiveSeasonMock: vi.fn(),
  refreshGuildChatMock: vi.fn(),
  gameScreenRendererPropsMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
  }),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: useAuthMock,
}));

vi.mock('./useGameController', () => ({
  useGameController: useGameControllerMock,
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getCharacters: getCharactersMock,
    getSeasonArchives: getSeasonArchivesMock,
    getActiveSeason: getActiveSeasonMock,
    joinSeason: joinSeasonMock,
    switchPlayer: switchPlayerMock,
  };
});

vi.mock('@/lib/assets', () => ({
  screenBackgroundSrc: vi.fn(() => undefined),
  zoneImageSrc: vi.fn(() => undefined),
}));

vi.mock('@pocketrealm/game-engine', () => ({
  calculateEfficiency: vi.fn(() => 1),
}));

vi.mock('@/components/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/common/JoinSeasonBanner', () => ({
  JoinSeasonBanner: ({ suggestedUsername, onJoin }: { suggestedUsername: string; onJoin: (username: string) => void }) => (
    <button onClick={() => onJoin(suggestedUsername)}>Join Season</button>
  ),
}));

vi.mock('./GameScreenRenderer', () => ({
  GameScreenRenderer: ({
    onSwitchPlayer,
    realmLabel,
    onGuildMembershipChange,
  }: {
    onSwitchPlayer: (playerId: string) => void;
    realmLabel: string;
    onGuildMembershipChange?: () => void;
  }) => {
    gameScreenRendererPropsMock({ onSwitchPlayer, realmLabel, onGuildMembershipChange });
    return (
      <div>
        <div>Realm: {realmLabel}</div>
        <button onClick={() => onSwitchPlayer('season-player')}>Switch Character</button>
      </div>
    );
  },
}));

vi.mock('@/components/common/ChangelogModal', () => ({ ChangelogModal: () => null }));
vi.mock('@/components/common/ConfirmModal', () => ({ ConfirmModal: () => null }));
vi.mock('@/components/common/LootPicker', () => ({ LootPicker: () => null }));
vi.mock('@/components/common/LootReveal', () => ({ LootReveal: () => null }));
vi.mock('@/components/common/XpRateTutorial', () => ({ XpRateTutorial: () => null }));
vi.mock('@/components/common/ErrorBoundary', () => ({ ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));
vi.mock('@/components/common/SubNav', () => ({ SubNav: () => null }));
vi.mock('@/components/AchievementToast', () => ({ AchievementToast: () => null }));
vi.mock('@/components/QuestToast', () => ({ QuestToast: () => null }));
vi.mock('@/components/ForgeResultToast', () => ({ ForgeResultToast: () => null }));
vi.mock('@/components/RateLimitToast', () => ({ RateLimitToast: () => null }));
vi.mock('@/components/ErrorToast', () => ({ ErrorToast: () => null }));
vi.mock('@/components/common/ConnectionBanner', () => ({ ConnectionBanner: () => null }));
vi.mock('@/components/TutorialBanner', () => ({ TutorialBanner: () => null }));
vi.mock('@/components/VerificationBanner', () => ({ VerificationBanner: () => null }));
vi.mock('@/components/TutorialDialog', () => ({ TutorialDialog: () => null }));
vi.mock('@/components/StarterWeaponPopup', () => ({ StarterWeaponPopup: () => null }));
vi.mock('@/components/ChatPanel', () => ({ ChatPanel: () => null }));

vi.mock('./hooks/useRateLimitToast', () => ({
  useRateLimitToast: vi.fn(),
}));

vi.mock('./hooks/useErrorToast', () => ({
  useErrorToast: vi.fn(),
}));

vi.mock('@/hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    state: 'unsubscribed',
    toggle: vi.fn(),
  }),
}));

vi.mock('@/hooks/useChat', () => ({
  useChat: () => ({
    isOpen: false,
    toggleChat: vi.fn(),
    activeChannel: 'world',
    setActiveChannel: vi.fn(),
    worldMessages: [],
    globalActivityMessages: [],
    zoneMessages: [],
    guildMessages: [],
    casinoMessages: [],
    presence: { worldOnline: 0, zoneOnline: {}, casinoOnline: 0 },
    unreadWorld: 0,
    unreadZone: 0,
    unreadGuild: 0,
    unreadCasino: 0,
    guildChatLabel: null,
    refreshGuildChat: refreshGuildChatMock,
    casinoActive: false,
    sendMessage: vi.fn(),
    rateLimitError: null,
    pinnedWorld: null,
    pinnedZone: null,
    pinnedGuild: null,
    joinCasino: vi.fn(),
    leaveCasino: vi.fn(),
    injectCasinoSystemMessage: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCasinoSocket', () => ({
  useCasinoSocket: () => ({
    dealerMessages: [],
  }),
}));

import GamePage from './page';

afterEach(() => {
  cleanup();
});

function createGameControllerState() {
  return {
    activeScreen: 'home',
    setActiveScreen: setActiveScreenMock,
    handleNavigate: vi.fn(),
    getActiveTab: vi.fn(() => 'home'),
    turns: 100,
    skills: [],
    equipment: [],
    activeCraftingSkill: 'weaponsmithing',
    pvpNotificationCount: 0,
    incomingFriendRequestCount: 0,
    mailUnreadCount: 0,
    playbackActive: false,
    currentZone: { id: 'zone-town', name: 'Starter Town', zoneType: 'town' },
    activeZoneId: 'zone-town',
    busyAction: null,
    slowAction: false,
    actionError: null,
    hpState: { currentHp: 100, maxHp: 100, regenPerSecond: 1, isRecovering: false, recoveryCost: null },
    tutorialStep: 999,
    skipTutorial: vi.fn(),
    advanceTutorial: vi.fn(),
    handleClaimStarterWeapon: vi.fn(),
    showChangelog: false,
    dismissChangelog: vi.fn(),
    openChangelog: vi.fn(),
    achievementUnclaimedCount: 0,
    quests: [],
    pendingLootSession: null,
    handleClaimLoot: vi.fn(),
    handleDismissLoot: vi.fn(),
    handleReopenLoot: vi.fn(),
    confirmAbandonLoot: false,
    abandonLootAndTravel: vi.fn(),
    cancelAbandonLoot: vi.fn(),
    lootRevealItems: null,
    handleDismissLootReveal: vi.fn(),
    inventoryCapacity: 24,
    inventoryUsedSlots: 0,
    isOffline: false,
    loadAchievements: vi.fn(),
    loadQuests: vi.fn(),
    loadAll: loadAllMock,
  };
}

describe('GamePage realm switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useAuthMock.mockReturnValue({
      player: {
        id: 'permanent-player',
        username: 'Rook',
        email: 'rook@example.com',
        role: 'player',
        emailVerified: true,
        isPremium: false,
        premiumExpiresAt: null,
        seasonId: null,
      },
      isLoading: false,
      isAuthenticated: true,
      logout: logoutMock,
      refreshPlayer: refreshPlayerMock.mockResolvedValue(undefined),
      storeTokens: storeTokensMock,
    });

    useGameControllerMock.mockReturnValue(createGameControllerState());

    getSeasonArchivesMock.mockResolvedValue({ data: { archives: [] } });
    getCharactersMock.mockResolvedValue({
      data: {
        characters: [
          {
            id: 'permanent-player',
            username: 'Rook',
            characterLevel: 12,
            seasonId: null,
            seasonName: null,
            seasonStatus: null,
            seasonEndsAt: null,
          },
        ],
      },
    });
    getActiveSeasonMock.mockResolvedValue({
      data: {
        season: {
          id: 'season-1',
          name: 'Season 1',
          status: 'active',
          endsAt: '2026-05-01T00:00:00.000Z',
        },
      },
    });

    joinSeasonMock.mockResolvedValue({
      data: {
        accessToken: 'season-access',
        refreshToken: 'season-refresh',
      },
    });
    switchPlayerMock.mockResolvedValue({
      data: {
        accessToken: 'switch-access',
        refreshToken: 'switch-refresh',
      },
    });
    loadAllMock.mockResolvedValue(undefined);
  });

  it('reloads the game controller after joining a season', async () => {
    render(<GamePage />);

    expect(await screen.findByText('Realm: Preseason')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: 'Join Season' }));

    await waitFor(() => {
      expect(storeTokensMock).toHaveBeenCalledWith('season-access', 'season-refresh');
      expect(refreshPlayerMock).toHaveBeenCalled();
      expect(loadAllMock).toHaveBeenCalled();
      expect(setActiveScreenMock).toHaveBeenCalledWith('home');
    });
  });

  it('reloads the game controller after switching characters', async () => {
    render(<GamePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Switch Character' }));

    await waitFor(() => {
      expect(storeTokensMock).toHaveBeenCalledWith('switch-access', 'switch-refresh');
      expect(refreshPlayerMock).toHaveBeenCalled();
      expect(loadAllMock).toHaveBeenCalled();
    });
  });

  it('passes guild chat refresh to game screens for guild membership changes', async () => {
    render(<GamePage />);

    await screen.findByText('Realm: Preseason');

    expect(gameScreenRendererPropsMock).toHaveBeenCalledWith(expect.objectContaining({
      onGuildMembershipChange: refreshGuildChatMock,
    }));
  });

  it('keeps Stripe checkout return params after applying the settings deep link', async () => {
    window.history.replaceState(
      {},
      '',
      '/game?screen=settings&support=success&session_id=cs_test_123',
    );

    render(<GamePage />);

    await waitFor(() => expect(setActiveScreenMock).toHaveBeenCalledWith('settings'));
    expect(window.location.pathname).toBe('/game');
    expect(window.location.search).toContain('support=success');
    expect(window.location.search).toContain('session_id=cs_test_123');
    expect(window.location.search).not.toContain('screen=settings');
  });
});
