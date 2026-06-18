import type { Client, GuildMember, MessageCreateOptions } from 'discord.js';

import type { BotConfig } from '../config.js';
import { textCard } from './v2Card.js';

export type WelcomeResult =
  | { sent: true }
  | {
    sent: false;
    reason: 'not_configured' | 'guild_mismatch' | 'bot_user' | 'membership_screening_pending' | 'channel_unavailable';
  };

interface WelcomeDeps {
  client: Pick<Client, 'channels'>;
  config: BotConfig;
}

interface MemberScreeningState {
  pending?: boolean | null;
}

export async function welcomeGuildMember(member: GuildMember, deps: WelcomeDeps): Promise<WelcomeResult> {
  if (!deps.config.welcomeChannelId) {
    return { sent: false, reason: 'not_configured' };
  }

  if (member.guild.id !== deps.config.guildId) {
    return { sent: false, reason: 'guild_mismatch' };
  }

  if (member.user.bot) {
    return { sent: false, reason: 'bot_user' };
  }

  if (member.pending) {
    return { sent: false, reason: 'membership_screening_pending' };
  }

  const channel = await deps.client.channels.fetch(deps.config.welcomeChannelId);
  if (!channel?.isSendable()) {
    return { sent: false, reason: 'channel_unavailable' };
  }

  await channel.send(createWelcomeMessage(member, deps.config));
  return { sent: true };
}

export function shouldWelcomeAfterMemberUpdate(
  oldMember: MemberScreeningState,
  newMember: MemberScreeningState,
): boolean {
  return oldMember.pending === true && newMember.pending === false;
}

function createWelcomeMessage(member: GuildMember, config: BotConfig): MessageCreateOptions {
  return textCard({
    emojiKey: 'welcome',
    title: `Welcome to PocketRealm, <@${member.id}>`,
    emojiMap: config.emojiMap,
    lines: [
      'Use `/link` to connect your game account, `/wiki` for game help, and `/report` if you need support.',
      `Friendly duels live in <#${config.duelsChannelId}>.`,
      `Play: ${config.webBaseUrl}`,
    ],
    allowedMentions: { users: [member.id], roles: [], parse: [] },
  }) as MessageCreateOptions;
}
