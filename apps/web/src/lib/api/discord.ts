import { fetchApi } from './core';
import type { ApiResponse } from './core';

export interface DiscordLinkResponse {
  id: string;
  discordUserId: string;
  discordGuildId: string;
  linkedAt: string;
  roleSyncedAt: string | null;
}

export interface DiscordLinkStatusGetResponse {
  linked: boolean;
  link: DiscordLinkResponse | null;
}

export interface DiscordLinkClaimResponse {
  link: DiscordLinkResponse;
  titleAchievementId: 'discord_linked';
}

export interface DiscordLinkStatusResponse {
  linked: boolean;
  discordUserId?: string;
  discordGuildId?: string;
  linkedAt?: string;
  roleSyncedAt?: string | null;
  titleReward?: 'Linked Adventurer';
}

export type DiscordLinkApiResponse =
  | DiscordLinkStatusResponse
  | DiscordLinkStatusGetResponse
  | DiscordLinkClaimResponse;

export function normalizeDiscordLinkStatus(response: DiscordLinkApiResponse): DiscordLinkStatusResponse {
  if ('link' in response) {
    const link = response.link;
    const linked = link !== null && ('linked' in response ? response.linked : true);

    return {
      linked,
      discordUserId: link?.discordUserId,
      discordGuildId: link?.discordGuildId,
      linkedAt: link?.linkedAt,
      roleSyncedAt: link?.roleSyncedAt,
      titleReward: linked ? 'Linked Adventurer' : undefined,
    };
  }

  return response;
}

export async function getDiscordLinkStatus(): Promise<ApiResponse<DiscordLinkStatusResponse>> {
  const response = await fetchApi<DiscordLinkStatusGetResponse>('/api/v1/discord/link');
  return response.data ? { data: normalizeDiscordLinkStatus(response.data) } : response;
}

export async function claimDiscordLinkCode(code: string): Promise<ApiResponse<DiscordLinkStatusResponse>> {
  const response = await fetchApi<DiscordLinkClaimResponse>('/api/v1/discord/link', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });

  return response.data ? { data: normalizeDiscordLinkStatus(response.data) } : response;
}
