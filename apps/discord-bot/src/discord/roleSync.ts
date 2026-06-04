import type { Guild } from 'discord.js';

import type { PocketRealmApiClient } from '../api/pocketRealmApi.js';
import type { BotConfig } from '../config.js';

interface UnsyncedDiscordLink {
  id: string;
  discordUserId: string;
  discordGuildId: string;
  status: string;
}

interface UnsyncedLinksResponse {
  links: UnsyncedDiscordLink[];
}

export interface RoleSyncSummary {
  fetched: number;
  roleSynced: number;
  missingMembers: number;
  failed: number;
}

export interface SyncLinkedRolesOptions {
  api: Pick<PocketRealmApiClient, 'get' | 'post'>;
  guild: Guild;
  config: Pick<BotConfig, 'guildId' | 'verifiedRoleId'>;
}

export async function syncLinkedRoles({
  api,
  guild,
  config,
}: SyncLinkedRolesOptions): Promise<RoleSyncSummary> {
  const links = await api.get<UnsyncedLinksResponse>(
    `/api/v1/discord/links/unsynced?guildId=${config.guildId}`,
  );
  const summary: RoleSyncSummary = {
    fetched: links.links.length,
    roleSynced: 0,
    missingMembers: 0,
    failed: 0,
  };

  for (const link of links.links) {
    if (link.status !== 'active') continue;

    const member = await guild.members.fetch(link.discordUserId).catch(() => null);
    if (!member) {
      summary.missingMembers += 1;
      continue;
    }

    try {
      await member.roles.add(config.verifiedRoleId);
      await api.post(`/api/v1/discord/links/${link.id}/synced`, {});
      summary.roleSynced += 1;
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
}
