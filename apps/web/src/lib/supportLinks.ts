export const WIKI_URL = '/wiki';
export const DISCORD_INVITE_URL = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL ?? '';
export const KNOWN_ISSUES_URL = process.env.NEXT_PUBLIC_KNOWN_ISSUES_URL ?? DISCORD_INVITE_URL;

export function hasDiscordInvite(): boolean {
  return DISCORD_INVITE_URL.length > 0;
}
