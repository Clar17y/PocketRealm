import React from 'react';
import { renderToString } from 'react-dom/server';
import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams({ token: 'reset-token' }),
}));

vi.mock('next/image', () => ({
  default: ({ fill: _fill, priority: _priority, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) =>
    React.createElement('img', props),
}));

vi.mock('@/lib/api', () => ({
  resetPassword: vi.fn(),
}));

import ResetPasswordPage from './page';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ResetPasswordPage', () => {
  it('renders the submit button disabled before hydration to avoid native GET form submits', () => {
    const html = renderToString(React.createElement(ResetPasswordPage));

    expect(html).toContain('type="submit"');
    expect(html).toContain('disabled=""');
  });
});
