import type { Guild, GuildMember } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';
import { syncLinkedRoles } from './roleSync.js';

describe('syncLinkedRoles', () => {
  const unsyncedLinksResponse = {
    links: [
      {
        id: 'link-1',
        discordUserId: '123456789012345678',
        discordGuildId: '234567890123456789',
        linkedAt: '2026-06-04T12:00:00.000Z',
        roleSyncedAt: null,
      },
    ],
  };
  const config = {
    guildId: '234567890123456789',
    playerRoleId: '456789012345678901',
    verifiedRoleId: '345678901234567890',
  } as BotConfig;

  it('adds the player and verified roles for unsynced links before marking them synced', async () => {
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

    const summary = await syncLinkedRoles({ api, guild, config });

    expect(get).toHaveBeenCalledWith('/api/v1/discord/links/unsynced?guildId=234567890123456789');
    expect(fetch).toHaveBeenCalledWith('123456789012345678');
    expect(add).toHaveBeenCalledWith('456789012345678901');
    expect(add).toHaveBeenCalledWith('345678901234567890');
    expect(post).toHaveBeenCalledWith('/api/v1/discord/links/link-1/synced', {});
    expect(summary).toEqual({
      fetched: 1,
      roleSynced: 1,
      missingMembers: 0,
      failed: 0,
    });
  });

  it('counts missing members without marking the link synced', async () => {
    const get = vi.fn(async <T>(): Promise<T> => unsyncedLinksResponse as T);
    const post = vi.fn<Pick<PocketRealmApiClient, 'post'>['post']>();
    const api = { get, post } as Pick<PocketRealmApiClient, 'get' | 'post'>;
    const fetch = vi.fn(async (): Promise<GuildMember> => {
      throw new Error('member not found');
    });
    const guild = {
      members: { fetch },
    } as unknown as Guild;

    const summary = await syncLinkedRoles({ api, guild, config });

    expect(post).not.toHaveBeenCalled();
    expect(summary).toEqual({
      fetched: 1,
      roleSynced: 0,
      missingMembers: 1,
      failed: 0,
    });
  });

  it('counts role-add failures without marking the link synced', async () => {
    const get = vi.fn(async <T>(): Promise<T> => unsyncedLinksResponse as T);
    const post = vi.fn<Pick<PocketRealmApiClient, 'post'>['post']>();
    const api = { get, post } as Pick<PocketRealmApiClient, 'get' | 'post'>;
    const add = vi.fn<GuildMember['roles']['add']>(async (): Promise<GuildMember> => {
      throw new Error('role add failed');
    });
    const fetch = vi.fn(async () => ({
      roles: { add },
    } as unknown as GuildMember));
    const guild = {
      members: { fetch },
    } as unknown as Guild;

    const summary = await syncLinkedRoles({ api, guild, config });

    expect(add).toHaveBeenCalledWith('456789012345678901');
    expect(post).not.toHaveBeenCalled();
    expect(summary).toEqual({
      fetched: 1,
      roleSynced: 0,
      missingMembers: 0,
      failed: 1,
    });
  });
});
