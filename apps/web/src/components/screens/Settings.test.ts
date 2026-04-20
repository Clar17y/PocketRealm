import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createPremiumCheckoutMock,
  confirmPremiumCheckoutMock,
  getPremiumStatusMock,
  getPremiumPurchasesMock,
} = vi.hoisted(() => ({
  createPremiumCheckoutMock: vi.fn(),
  confirmPremiumCheckoutMock: vi.fn(),
  getPremiumStatusMock: vi.fn(),
  getPremiumPurchasesMock: vi.fn(),
}));

vi.mock('@/components/ui/Slider', () => ({
  Slider: () => React.createElement('div', { 'data-testid': 'slider' }),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    resendVerification: vi.fn(),
    changeEmail: vi.fn(),
    changePassword: vi.fn(),
    createPremiumCheckout: createPremiumCheckoutMock,
    confirmPremiumCheckout: confirmPremiumCheckoutMock,
    getPremiumStatus: getPremiumStatusMock,
    getPremiumPurchases: getPremiumPurchasesMock,
  };
});

import { changeEmail, changePassword, resendVerification } from '@/lib/api';
import { Settings } from './Settings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  window.history.replaceState({}, '', '/game?screen=settings');
  getPremiumStatusMock.mockResolvedValue({
    data: { premium: { isPremium: false, premiumExpiresAt: null } },
  });
  getPremiumPurchasesMock.mockResolvedValue({ data: { purchases: [] } });
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

function renderSettings(overrides: Partial<React.ComponentProps<typeof Settings>> = {}) {
  return render(React.createElement(Settings, {
    username: 'Rook',
    email: 'rook@example.com',
    emailVerified: false,
    isPremium: false,
    premiumExpiresAt: null,
    seasonArchives: [],
    onAccountRefresh: vi.fn().mockResolvedValue(undefined),
    onForceRelogin: vi.fn(),
    combatLogSpeedMs: 800,
    onCombatLogSpeedChange: vi.fn(),
    onCombatLogSpeedCommit: vi.fn(),
    autoSkipKnownCombat: false,
    onAutoSkipKnownCombatChange: vi.fn(),
    lowHpWarning: true,
    onLowHpWarningChange: vi.fn(),
    explorationSpeedMs: 800,
    onExplorationSpeedChange: vi.fn(),
    onExplorationSpeedCommit: vi.fn(),
    defaultExploreTurns: 100,
    onDefaultExploreTurnsChange: vi.fn(),
    onDefaultExploreTurnsCommit: vi.fn(),
    quickRestHealPercent: 100,
    onQuickRestHealPercentChange: vi.fn(),
    defaultRefiningMax: false,
    onDefaultRefiningMaxChange: vi.fn(),
    forgeConfirmRarity: 'rare',
    onForgeConfirmRarityChange: vi.fn(),
    confirmRarity: 'rare',
    onConfirmRarityChange: vi.fn(),
    lootRevealRarity: 'rare',
    onLootRevealRarityChange: vi.fn(),
    showNpcDialogue: true,
    onShowNpcDialogueChange: vi.fn(),
    showItemFlavourText: true,
    onShowItemFlavourTextChange: vi.fn(),
    showBestiaryLore: true,
    onShowBestiaryLoreChange: vi.fn(),
    pushState: 'unsubscribed',
    onPushToggle: vi.fn(),
    notificationPrefs: {
      notifyPvpAttack: true,
      notifyPvpScout: true,
      notifyBossAppeared: true,
      notifyBossKilled: true,
      notifyTurnBankFull: true,
      notifyExpeditionStarted: true,
      notifyExpeditionFinished: true,
    },
    onNotificationPrefChange: vi.fn(),
    ...overrides,
  }));
}

describe('Settings', () => {
  it('renders the Support Pocketrealm panel with one-time purchase copy', async () => {
    renderSettings();

    expect(await screen.findByRole('heading', { name: 'Support Pocketrealm' })).toBeTruthy();
    expect(screen.getByText(/One-time purchase\. Grants 30 days of Champion\./i)).toBeTruthy();
    expect(screen.getByText('Free account')).toBeTruthy();
    expect(screen.getByText(/Champion perks/i)).toBeTruthy();
    expect(screen.getByText(/\+10% turn regen and turn bank cap/i)).toBeTruthy();
    expect(screen.getByText(/\+8 backpack slots/i)).toBeTruthy();
    expect(screen.getByText(/20 combat templates/i)).toBeTruthy();
    expect(screen.getByText(/Unlock the Champion title/i)).toBeTruthy();
  });

  it('renders recent Support Pocketrealm purchase history', async () => {
    getPremiumStatusMock.mockResolvedValue({
      data: { premium: { isPremium: true, premiumExpiresAt: '2026-05-17T12:00:00.000Z' } },
    });
    getPremiumPurchasesMock.mockResolvedValue({
      data: {
        purchases: [
          {
            id: 'purchase-1',
            championDaysGranted: 30,
            grantedUntil: '2026-05-17T12:00:00.000Z',
            createdAt: '2026-04-17T12:00:00.000Z',
          },
        ],
      },
    });

    renderSettings();

    expect(await screen.findByText(/Champion until/i)).toBeTruthy();
    expect(screen.getByText((content) => content.includes('30') && content.includes('days (until'))).toBeTruthy();
  });

  it('confirms a returned Stripe checkout session and refreshes premium state', async () => {
    const premiumExpiresAt = '2026-05-17T12:00:00.000Z';

    window.history.replaceState(
      {},
      '',
      '/game?screen=settings&support=success&session_id=cs_test_123',
    );

    confirmPremiumCheckoutMock.mockResolvedValue({
      data: { premium: { isPremium: true, premiumExpiresAt } },
    });
    getPremiumStatusMock.mockResolvedValue({
      data: { premium: { isPremium: true, premiumExpiresAt } },
    });
    getPremiumPurchasesMock.mockResolvedValue({
      data: {
        purchases: [
          {
            id: 'purchase-1',
            championDaysGranted: 30,
            grantedUntil: premiumExpiresAt,
            createdAt: '2026-04-17T12:00:00.000Z',
          },
        ],
      },
    });

    renderSettings();

    await waitFor(() => expect(confirmPremiumCheckoutMock).toHaveBeenCalledWith('cs_test_123'));
    const successDialog = await screen.findByRole('dialog', { name: /support pocketrealm success/i });
    expect(within(successDialog).getByText(/Thanks for supporting Pocketrealm/i)).toBeTruthy();
    expect(within(successDialog).getByText(/Champion title is now available in Achievements/i)).toBeTruthy();
    expect(within(successDialog).getByRole('button', { name: /continue/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Champion until/i)).toBeTruthy());
    await waitFor(() => expect(window.location.search).not.toContain('session_id='));
  });

  it('defaults to the Account tab and can switch to Game', () => {
    renderSettings();

    expect(screen.getByRole('tab', { name: 'Account' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('rook@example.com')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Game' }));

    expect(screen.getByText('Combat')).toBeTruthy();
  });

  it('resends verification from the account tab', async () => {
    vi.mocked(resendVerification).mockResolvedValue({ data: { message: 'Verification email sent' } });
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Resend verification' }));

    await waitFor(() => expect(resendVerification).toHaveBeenCalledTimes(1));
  });

  it('submits email changes then refreshes account state', async () => {
    const refresh = createDeferred<void>();
    const onAccountRefresh = vi.fn().mockReturnValue(refresh.promise);
    vi.mocked(changeEmail).mockResolvedValue({ data: { message: 'Email updated' } });
    renderSettings({ onAccountRefresh });

    fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Current password for email change'), { target: { value: 'hunter2-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update email' }));

    await waitFor(() => expect(changeEmail).toHaveBeenCalledWith('new@example.com', 'hunter2-password'));
    await waitFor(() => expect(onAccountRefresh).toHaveBeenCalledTimes(1));
    const updatePasswordButton = screen.getByRole('button', { name: 'Update password' }) as HTMLButtonElement;
    expect(updatePasswordButton.disabled).toBe(true);
    expect(screen.getByText('Email updated')).toBeTruthy();
    expect((screen.getByLabelText('Current password for email change') as HTMLInputElement).value).toBe('');

    await act(async () => {
      refresh.resolve(undefined);
    });

    await waitFor(() => expect(updatePasswordButton.disabled).toBe(false));
  });

  it('blocks email submission when the address matches the current email', () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText('Current password for email change'), { target: { value: 'hunter2-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update email' }));

    expect(changeEmail).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a different email address to update.')).toBeTruthy();
  });

  it('shows a refresh error when the post-email account refresh rejects', async () => {
    const onAccountRefresh = vi.fn().mockRejectedValue(new Error('refresh failed'));
    vi.mocked(changeEmail).mockResolvedValue({ data: { message: 'Email updated' } });
    renderSettings({ onAccountRefresh });

    fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Current password for email change'), { target: { value: 'hunter2-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update email' }));

    await waitFor(() => expect(changeEmail).toHaveBeenCalledWith('new@example.com', 'hunter2-password'));
    await waitFor(() => expect(onAccountRefresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Email updated, but failed to refresh account.')).toBeTruthy());

    expect(screen.queryByText('Email updated')).toBeNull();
    expect((screen.getByLabelText('Current password for email change') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('button', { name: 'Update email' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('forces re-login after a successful password change', async () => {
    const onForceRelogin = vi.fn();
    vi.mocked(changePassword).mockResolvedValue({ data: { message: 'Password updated' } });
    renderSettings({ emailVerified: true, onForceRelogin });

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'much-better-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'much-better-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old-password', 'much-better-password'));
    await waitFor(() => expect(onForceRelogin).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Confirm new password') as HTMLInputElement).value).toBe('');
  });

  it('shows password mismatch inline and does not submit the password change', () => {
    renderSettings({ emailVerified: true });

    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'old-password' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'much-better-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    const passwordCard = screen.getByRole('heading', { name: 'Change password' }).parentElement!;
    expect(within(passwordCard).getByText('New password confirmation does not match.')).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('renders season archive summaries on the account tab', () => {
    renderSettings({
      seasonArchives: [
        {
          id: 'archive-1',
          username: 'Rook_S1',
          characterLevel: 21,
          characterXp: 12345,
          attributes: {},
          skills: [],
          stats: {},
          combatTemplates: [],
          leaderboardRanks: { pvp_rating: 3 },
          rewardsEarned: [{ type: 'title', rank: 3 }],
          mergeLog: {},
          createdAt: '2026-03-20T00:00:00.000Z',
          season: {
            id: 'season-1',
            name: 'Season 1',
            startsAt: '2026-03-01T00:00:00.000Z',
            endsAt: '2026-03-19T00:00:00.000Z',
          },
        },
      ],
    });

    expect(screen.getByText('Season Archives')).toBeTruthy();
    expect(screen.getByText('Season 1')).toBeTruthy();
    expect(screen.getByText('Rook_S1 · Level 21')).toBeTruthy();
    expect(screen.getByText('1 rewards')).toBeTruthy();
    expect(screen.getByText('1 tracked ranks')).toBeTruthy();
  });
});
