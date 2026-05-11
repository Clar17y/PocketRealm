import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionBanner } from './ConnectionBanner';

const { useConnectionRecovery, useConnectionStatus } = vi.hoisted(() => ({
  useConnectionRecovery: vi.fn(),
  useConnectionStatus: vi.fn(),
}));

vi.mock('@/hooks/useConnectionStatus', () => ({ useConnectionStatus }));
vi.mock('@/hooks/useConnectionRecovery', () => ({ useConnectionRecovery }));

describe('ConnectionBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useConnectionStatus.mockReturnValue('disconnected');
  });

  it('mounts automatic recovery with the current connection status', () => {
    render(<ConnectionBanner />);

    expect(useConnectionRecovery).toHaveBeenCalledWith('disconnected');
    expect(screen.getByText('Connection lost. Reconnecting...')).toBeTruthy();
  });
});
