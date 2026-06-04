import type { Guild, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { syncLinkedRoles } from './roleSync.js';

describe('syncLinkedRoles', () => {
  it('adds the verified role for unsynced active links and marks them synced', async () => {
    const unsyncedLinksResponse = {
      links: [
        {
          id: 'link-1',
          discordUserId: '123456789012345678',
          discordGuildId: '234567890123456789',
          status: 'active',
        },
      ],
    };
    const get = vi.fn(async <T>(): Promise<T> => unsyncedLinksResponse as T);
    const post = vi.fn(async <T>(): Promise<T> => null as T);
    const api = { get, post } as Pick<PocketRealmApiClient, 'get' | 'post'>;
    const add = vi.fn<GuildMember['roles']['add']>(async () => ({} as GuildMember));
    const fetch = vi.fn(async () => ({
      roles: { add },
    } as unknown as GuildMember));
    const guild = {
      members: { fetch },
    } as unknown as Guild;
    const config = {
      guildId: '234567890123456789',
      verifiedRoleId: '345678901234567890',
    } as BotConfig;

    const summary = await syncLinkedRoles({ api, guild, config });

    expect(get).toHaveBeenCalledWith('/api/v1/discord/links/unsynced?guildId=234567890123456789');
    expect(fetch).toHaveBeenCalledWith('123456789012345678');
    expect(add).toHaveBeenCalledWith('345678901234567890');
    expect(post).toHaveBeenCalledWith('/api/v1/discord/links/link-1/synced', {});
    expect(summary).toEqual({
      fetched: 1,
      roleSynced: 1,
      missingMembers: 0,
      failed: 0,
    });
  });
});
