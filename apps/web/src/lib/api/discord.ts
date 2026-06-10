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

// These return the raw API shapes; DiscordLinkCard owns normalization via
// normalizeDiscordLinkStatus, so responses are normalized exactly once.
export function getDiscordLinkStatus(): Promise<ApiResponse<DiscordLinkStatusGetResponse>> {
  return fetchApi<DiscordLinkStatusGetResponse>('/api/v1/discord/link');
}

export function claimDiscordLinkCode(code: string): Promise<ApiResponse<DiscordLinkClaimResponse>> {
  return fetchApi<DiscordLinkClaimResponse>('/api/v1/discord/link', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
