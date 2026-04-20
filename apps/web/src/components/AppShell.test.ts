import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('@/components/ZoneBackground', () => ({
  ZoneBackground: () => null,
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', props),
}));

vi.mock('@/lib/assets', () => ({
  uiIconSrc: vi.fn(() => '/turn-icon.webp'),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AppShell', () => {
  it('renders a dedicated settings cog, calls onSettings when clicked, and keeps settings out of the username dropdown', () => {
    const onSettings = vi.fn();

    render(
      React.createElement(
        AppShell,
        {
          turns: 42,
          username: 'Rook',
          mailUnreadCount: 3,
          onMailClick: vi.fn(),
          onSettings,
          onLogout: vi.fn(),
          onWhatsNew: vi.fn(),
        },
        React.createElement('div', null, 'Child'),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(onSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Rook/i }));

    expect(screen.queryByRole('menuitem', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: "What's New" })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeTruthy();
  });

  it('shows the username as plain text when only onSettings is provided', () => {
    render(
      React.createElement(
        AppShell,
        {
          username: 'Rook',
          onSettings: vi.fn(),
        },
        React.createElement('div', null, 'Child'),
      ),
    );

    expect(screen.getByText('Rook')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Rook/i })).toBeNull();
  });

  it('closes the username dropdown before opening settings from the cog', () => {
    const onSettings = vi.fn();

    render(
      React.createElement(
        AppShell,
        {
          username: 'Rook',
          onSettings,
          onLogout: vi.fn(),
          onWhatsNew: vi.fn(),
        },
        React.createElement('div', null, 'Child'),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Rook/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(onSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes the username dropdown before opening mail from the header button', () => {
    const onMailClick = vi.fn();

    render(
      React.createElement(
        AppShell,
        {
          username: 'Rook',
          mailUnreadCount: 3,
          onMailClick,
          onLogout: vi.fn(),
          onWhatsNew: vi.fn(),
        },
        React.createElement('div', null, 'Child'),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /Rook/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Mail (3 unread)' }));

    expect(onMailClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows a character picker when multiple characters exist and switches realms from the header', () => {
    const onSwitchPlayer = vi.fn();

    render(
      React.createElement(
        AppShell,
        {
          username: 'Rook',
          realmLabel: 'Permanent Realm',
          activePlayerId: 'permanent-player',
          characters: [
            {
              id: 'permanent-player',
              username: 'Rook',
              characterLevel: 42,
              seasonId: null,
              seasonName: null,
              seasonStatus: null,
              seasonEndsAt: null,
            },
            {
              id: 'season-player',
              username: 'Rook_S1',
              characterLevel: 18,
              seasonId: 'season-1',
              seasonName: 'Season 1',
              seasonStatus: 'active',
              seasonEndsAt: '2099-01-01T00:00:00.000Z',
            },
          ],
          onSwitchPlayer,
        },
        React.createElement('div', null, 'Child'),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch character' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Rook_S1/i }));

    expect(onSwitchPlayer).toHaveBeenCalledWith('season-player');
  });
});
