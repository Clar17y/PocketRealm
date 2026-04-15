import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

describe('AppShell', () => {
  it('renders a dedicated settings cog and keeps settings out of the username dropdown', () => {
    render(
      React.createElement(
        AppShell,
        {
          turns: 42,
          username: 'Rook',
          mailUnreadCount: 3,
          onMailClick: vi.fn(),
          onSettings: vi.fn(),
          onLogout: vi.fn(),
          onWhatsNew: vi.fn(),
        },
        React.createElement('div', null, 'Child'),
      ),
    );

    expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Rook/i }));

    expect(screen.queryByRole('menuitem', { name: 'Settings' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: "What's New" })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Logout' })).toBeTruthy();
  });
});
