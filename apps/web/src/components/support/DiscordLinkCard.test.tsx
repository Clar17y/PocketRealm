import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordLinkCard } from './DiscordLinkCard';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
}

describe('DiscordLinkCard', () => {
  afterEach(() => {
    cleanup();
  });

  it('claims a Discord link code and shows the title reward proof', async () => {
    const onClaimCode = vi.fn().mockResolvedValue({
      data: {
        link: {
          id: 'discord-link-1',
          discordUserId: '123456789',
          discordGuildId: 'guild-1',
          linkedAt: '2026-06-04T12:00:00.000Z',
          roleSyncedAt: null,
        },
        titleAchievementId: 'discord_linked',
      },
    });

    render(
      <DiscordLinkCard
        loadStatus={vi.fn().mockResolvedValue({ data: { linked: false, link: null } })}
        claimCode={onClaimCode}
      />,
    );

    expect(await screen.findByText(/link your discord account/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/discord link code/i), { target: { value: 'ABC12345' } });
    fireEvent.click(screen.getByRole('button', { name: /link discord/i }));

    await waitFor(() => expect(onClaimCode).toHaveBeenCalledWith('ABC12345'));
    expect(await screen.findByText(/linked adventurer/i)).toBeTruthy();
  });

  it('shows current linked state loaded from the API', async () => {
    render(
      <DiscordLinkCard
        loadStatus={vi.fn().mockResolvedValue({
          data: {
            linked: true,
            link: {
              id: 'discord-link-2',
              discordUserId: '987654321',
              discordGuildId: 'guild-1',
              linkedAt: '2026-06-04T12:00:00.000Z',
              roleSyncedAt: '2026-06-04T12:05:00.000Z',
            },
          },
        })}
        claimCode={vi.fn()}
      />,
    );

    expect(await screen.findByText(/discord account linked/i)).toBeTruthy();
    expect(screen.getByText(/987654321/i)).toBeTruthy();
    expect(screen.getByText(/linked adventurer/i)).toBeTruthy();
  });

  it('shows API errors when claiming fails', async () => {
    render(
      <DiscordLinkCard
        loadStatus={vi.fn().mockResolvedValue({ data: { linked: false, link: null } })}
        claimCode={vi.fn().mockResolvedValue({
          error: { message: 'That Discord link code is invalid.', code: 'INVALID_DISCORD_LINK_CODE' },
        })}
      />,
    );

    expect(await screen.findByText(/link your discord account/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/discord link code/i), { target: { value: 'BADCODE1' } });
    fireEvent.click(screen.getByRole('button', { name: /link discord/i }));

    expect((await screen.findByRole('alert')).textContent).toBe('That Discord link code is invalid.');
  });

  it('does not let a stale status response revert a successful claim', async () => {
    const initialStatusRequest = deferred<{ data: { linked: false; link: null } }>();
    const staleStatusRequest = deferred<{ data: { linked: false; link: null } }>();
    const claimRequest = deferred<{
      data: {
        link: {
          id: string;
          discordUserId: string;
          discordGuildId: string;
          linkedAt: string;
          roleSyncedAt: null;
        };
        titleAchievementId: 'discord_linked';
      };
    }>();
    const onClaimCode = vi.fn().mockReturnValue(claimRequest.promise);
    const initialLoadStatus = vi.fn().mockReturnValue(initialStatusRequest.promise);
    const staleLoadStatus = vi.fn().mockReturnValue(staleStatusRequest.promise);

    const { rerender } = render(<DiscordLinkCard loadStatus={initialLoadStatus} claimCode={onClaimCode} />);

    initialStatusRequest.resolve({ data: { linked: false, link: null } });
    expect(await screen.findByText(/link your discord account/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/discord link code/i), { target: { value: 'ABC12345' } });
    fireEvent.click(screen.getByRole('button', { name: /link discord/i }));

    await waitFor(() => expect(onClaimCode).toHaveBeenCalledWith('ABC12345'));

    rerender(<DiscordLinkCard loadStatus={staleLoadStatus} claimCode={onClaimCode} />);
    await waitFor(() => expect(staleLoadStatus).toHaveBeenCalled());

    claimRequest.resolve({
      data: {
        link: {
          id: 'discord-link-3',
          discordUserId: '123456789',
          discordGuildId: 'guild-1',
          linkedAt: '2026-06-04T12:00:00.000Z',
          roleSyncedAt: null,
        },
        titleAchievementId: 'discord_linked',
      },
    });

    expect(await screen.findByText(/linked adventurer/i)).toBeTruthy();

    staleStatusRequest.resolve({ data: { linked: false, link: null } });

    await waitFor(() => expect(screen.getByText(/discord account linked/i)).toBeTruthy());
    expect((screen.getByRole('button', { name: /link discord/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables claim controls while loading and after the account is linked', async () => {
    const statusRequest = deferred<{
      data: {
        linked: true;
        link: {
          id: string;
          discordUserId: string;
          discordGuildId: string;
          linkedAt: string;
          roleSyncedAt: null;
        };
      };
    }>();
    const onClaimCode = vi.fn();

    render(<DiscordLinkCard loadStatus={vi.fn().mockReturnValue(statusRequest.promise)} claimCode={onClaimCode} />);

    const input = screen.getByLabelText(/discord link code/i) as HTMLInputElement;
    const button = screen.getByRole('button', { name: /link discord/i }) as HTMLButtonElement;

    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);

    statusRequest.resolve({
      data: {
        linked: true,
        link: {
          id: 'discord-link-4',
          discordUserId: '987654321',
          discordGuildId: 'guild-1',
          linkedAt: '2026-06-04T12:00:00.000Z',
          roleSyncedAt: null,
        },
      },
    });

    expect(await screen.findByText(/discord account linked/i)).toBeTruthy();
    expect(input.disabled).toBe(true);
    expect(button.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'ABC12345' } });
    fireEvent.click(button);

    expect(onClaimCode).not.toHaveBeenCalled();
  });
});
