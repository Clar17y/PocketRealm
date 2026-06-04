import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiscordLinkCard } from './DiscordLinkCard';

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

    fireEvent.change(screen.getByLabelText(/discord link code/i), { target: { value: 'BADCODE1' } });
    fireEvent.click(screen.getByRole('button', { name: /link discord/i }));

    expect((await screen.findByRole('alert')).textContent).toBe('That Discord link code is invalid.');
  });
});
