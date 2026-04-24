import React from 'react';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '@/lib/api';

const push = vi.fn();
const setTokens = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('next/image', () => ({
  default: ({ fill: _fill, priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) =>
    React.createElement('img', props),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    setTokens,
    isLoading: false,
    isAuthenticated: false,
  }),
}));

vi.mock('@/lib/api', () => ({
  register: vi.fn(),
}));

import RegisterPage from './page';

afterEach(() => {
  cleanup();
  window.plausible = undefined;
  vi.clearAllMocks();
});

describe('RegisterPage', () => {
  it('renders the submit button disabled before hydration to avoid native GET form submits', () => {
    const html = renderToString(React.createElement(RegisterPage));

    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled=""');
  });

  it('redirects to the game after successful registration even if analytics tracking fails', async () => {
    const player = {
      id: 'player-1',
      username: 'Rook',
      email: 'rook@example.com',
      role: 'player',
      emailVerified: false,
      seasonId: null,
      isPremium: false,
      premiumExpiresAt: null,
    };
    vi.mocked(register).mockResolvedValue({
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        player,
      },
    });
    window.plausible = vi.fn(() => {
      throw new Error('analytics unavailable');
    });

    render(React.createElement(RegisterPage));

    const submitButton = screen.getByRole('button', { name: 'Begin Journey' }) as HTMLButtonElement;
    await waitFor(() => expect(submitButton.disabled).toBe(false));

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'Rook' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'rook@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct-horse-12345' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('Rook', 'rook@example.com', 'correct-horse-12345');
    });
    expect(setTokens).toHaveBeenCalledWith('access-token', 'refresh-token', player);
    expect(push).toHaveBeenCalledWith('/game');
  });
});
