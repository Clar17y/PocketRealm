import React from 'react';
import { renderToString } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PASSWORD_UPDATED_RELOGIN_MESSAGE, RELOGIN_MESSAGE_KEY } from './reloginMessage';

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
  login: vi.fn(),
}));

import LoginPage from './page';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('renders the submit button inert before hydration to avoid native GET form submits', () => {
    const html = renderToString(React.createElement(LoginPage));

    expect(html).toContain('type="button"');
    expect(html).not.toContain('disabled=""');
  });

  it('shows and clears the relogin success message after a forced password reset logout', () => {
    sessionStorage.setItem(RELOGIN_MESSAGE_KEY, PASSWORD_UPDATED_RELOGIN_MESSAGE);

    render(React.createElement(LoginPage));

    expect(screen.getByText(PASSWORD_UPDATED_RELOGIN_MESSAGE)).toBeTruthy();
    expect(sessionStorage.getItem(RELOGIN_MESSAGE_KEY)).toBeNull();
  });
});
