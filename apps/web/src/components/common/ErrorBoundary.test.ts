import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentryMock);

function Thrower() {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error');

  beforeAll(() => {
    consoleErrorSpy.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders an alert fallback and reports the error to Sentry', () => {
    render(
      React.createElement(
        ErrorBoundary,
        null,
        React.createElement(Thrower),
      ),
    );

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    expect(sentryMock.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
      expect.objectContaining({
        extra: expect.objectContaining({
          componentStack: expect.any(String),
        }),
      }),
    );
  });
});
