import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  };
});

import { changeEmail, changePassword, resendVerification } from '@/lib/api';
import { Settings } from './Settings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderSettings(overrides: Partial<React.ComponentProps<typeof Settings>> = {}) {
  return render(React.createElement(Settings, {
    username: 'Rook',
    email: 'rook@example.com',
    emailVerified: false,
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
    const onAccountRefresh = vi.fn().mockResolvedValue(undefined);
    vi.mocked(changeEmail).mockResolvedValue({ data: { message: 'Email updated' } });
    renderSettings({ onAccountRefresh });

    fireEvent.change(screen.getByLabelText('New email'), { target: { value: 'new@example.com' } });
    fireEvent.change(screen.getByLabelText('Current password for email change'), { target: { value: 'hunter2-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update email' }));

    await waitFor(() => expect(changeEmail).toHaveBeenCalledWith('new@example.com', 'hunter2-password'));
    await waitFor(() => expect(onAccountRefresh).toHaveBeenCalledTimes(1));
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
});
