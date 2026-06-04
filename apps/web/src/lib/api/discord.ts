import { fetchApi } from './core';

export interface DiscordLinkStatusResponse {
  linked: boolean;
  discordUserId?: string;
  discordGuildId?: string;
  linkedAt?: string;
  titleReward?: 'Linked Adventurer';
}

export function getDiscordLinkStatus() {
  return fetchApi<DiscordLinkStatusResponse>('/api/v1/discord/link');
}

export function claimDiscordLinkCode(code: string) {
  return fetchApi<DiscordLinkStatusResponse>('/api/v1/discord/link', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}
