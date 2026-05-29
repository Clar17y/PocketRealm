import React from 'react';
import { renderToString } from 'react-dom/server';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '@/lib/api';

const push = vi.fn();
const replace = vi.fn();
const prefetch = vi.fn();
const setTokens = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, prefetch }),
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
  it('renders auth fields before hydration while keeping submit inert', () => {
    const html = renderToString(React.createElement(RegisterPage));

    expect(html).toContain('type="button"');
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('id="username"');
    expect(html).toContain('id="email"');
    expect(html).toContain('id="password"');
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

    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'Rook' } });
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'rook@example.com' } });
    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'correct-horse-12345' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith('Rook', 'rook@example.com', 'correct-horse-12345');
    });
    expect(setTokens).toHaveBeenCalledWith('access-token', 'refresh-token', player);
    expect(replace).toHaveBeenCalledWith('/game');
  });

  it('prefetches the game route so post-registration navigation can start immediately', async () => {
    render(React.createElement(RegisterPage));

    await waitFor(() => {
      expect(prefetch).toHaveBeenCalledWith('/game');
    });
  });

  it('keeps the submit button disabled with a spinner and ignores duplicate submits until navigation', async () => {
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
    let resolveRegistration!: (value: Awaited<ReturnType<typeof register>>) => void;
    vi.mocked(register).mockReturnValue(new Promise((resolve) => {
      resolveRegistration = resolve;
    }));

    render(React.createElement(RegisterPage));

    const submitButton = screen.getByRole('button', { name: 'Begin Journey' }) as HTMLButtonElement;
    const form = submitButton.closest('form')!;
    await waitFor(() => expect(submitButton.disabled).toBe(false));

    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'Rook' } });
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'rook@example.com' } });
    fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'correct-horse-12345' } });
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(register).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(submitButton.disabled).toBe(true));
    expect(submitButton.getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('button', { name: 'Creating account...' }).querySelector('.animate-spin')).not.toBeNull();

    resolveRegistration({
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        player,
      },
    });

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/game');
    });
    expect(submitButton.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Creating account...' }).querySelector('.animate-spin')).not.toBeNull();
  });
});
