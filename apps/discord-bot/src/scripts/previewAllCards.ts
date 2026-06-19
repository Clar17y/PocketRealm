import 'dotenv/config';

import { REST, Routes } from 'discord.js';
import { DISCORD_NOTIFICATION_TYPES, type DiscordNotificationEventView } from '@pocketrealm/shared/discord/discordNotifications';
import pino from 'pino';

import { loadBotConfig, type BotConfig } from '../config.js';
import {
  buildChallengeCard,
  buildDeclineCard,
  buildReplayCard,
  buildResultCard,
} from '../discord/duelCard.js';
import { buildWelcomeCard } from '../discord/welcome.js';
import { statusCard } from '../discord/v2Card.js';
import { buildTriageCard } from '../support/triageCards.js';
import { buildNotificationCard } from '../notifications/notificationPoll.js';
import {
  buildProfileCard,
  buildRankCard,
  buildSkillsCard,
  buildTurnsCard,
} from '../interactions/playerCommands.js';
import { buildPreferenceCard } from '../interactions/notifyCommand.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

/**
 * Posts one of every bot-authored Components V2 card to a channel so the whole
 * message set can be eyeballed at real size before merging a message change.
 * Reuses the real production builders (no re-implementation) so what you see is
 * exactly what players/staff get. Buttons render but are inert here (no backing
 * duel/ticket) — delete the messages when done.
 *
 * The bot must be able to send messages in the target channel; a private
 * #bot-test channel works well.
 *
 * Usage: npm run preview-cards -- <channelId>
 *    or: CARD_PREVIEW_CHANNEL_ID=<channelId> npm run preview-cards
 */
function resolveChannelId(): string {
  const channelId = process.argv[2] ?? process.env.CARD_PREVIEW_CHANNEL_ID ?? process.env.DUEL_PREVIEW_CHANNEL_ID;
  if (!channelId) {
    throw new Error('Pass a channel id as an argument or set CARD_PREVIEW_CHANNEL_ID.');
  }
  return channelId;
}

interface PreviewableCard {
  flags: number;
  components: Array<{ toJSON(): unknown }>;
}

async function postCard(rest: REST, channelId: string, label: string, card: PreviewableCard): Promise<void> {
  await rest.post(Routes.channelMessages(channelId), {
    body: {
      flags: card.flags,
      components: card.components.map((component) => component.toJSON()),
      allowed_mentions: { parse: [] }, // never ping during a preview
    },
  });
  logger.info({ label }, 'Posted preview card');
}

async function postSectionLabel(rest: REST, channelId: string, title: string): Promise<void> {
  await rest.post(Routes.channelMessages(channelId), {
    body: {
      content: `​\n# ${title}`,
      allowed_mentions: { parse: [] },
    },
  });
}

function notificationEvent(
  type: DiscordNotificationEventView['type'],
  payload: DiscordNotificationEventView['payload'],
): DiscordNotificationEventView {
  return {
    id: `preview-${type}`,
    discordGuildId: '0',
    discordUserId: null,
    type,
    payload,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const sampleReplay = {
  id: 'preview-duel',
  status: 'resolved',
  page: 1,
  pageSize: 12,
  hasMore: false,
  summary: {
    challengerUsername: 'ZuKii',
    targetUsername: 'LuckyStar',
    challengerMaxHp: 132,
    targetMaxHp: 137,
    challengerMaxMana: 89,
    targetMaxMana: 89,
    challengerMaxStamina: 121,
    targetMaxStamina: 103,
  },
  entries: [
    duelEntry({ round: 1, action: 'attack', actionName: 'Power Strike', damage: 23, targetDefence: 10, hitChance: 0.8, hitRollValue: 0.2 }),
    duelEntry({ round: 2, action: 'attack', actionName: 'Quick Jab', targetDefence: 8, hitChance: 0.6, hitRollValue: 0.9 }),
    duelEntry({ round: 3, action: 'spell', spellName: 'Firebolt', actionName: 'Firebolt', damage: 18, targetMagicDefence: 5, hitChance: 0.7, hitRollValue: 0.1 }),
    duelEntry({ round: 4, action: 'spell', spellName: 'Frost Lance', actionName: 'Frost Lance', damage: 30, targetMagicDefence: 5, isCritical: true, hitChance: 0.7, hitRollValue: 0.1 }),
    duelEntry({ round: 5, action: 'heal', spellName: 'Mend', actionName: 'Mend', healAmount: 30, healResourceType: 'hp' }),
    duelEntry({ round: 6, action: 'defend', actionId: 'counter', actionName: 'Riposte', damage: 12 }),
    duelEntry({ round: 7, action: 'attack', actionName: 'Execute', damage: 40, targetDefence: 10, isCritical: true, hitChance: 0.9, hitRollValue: 0.1, combatantBHpAfter: 0 }),
  ],
};

function duelEntry(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    actor: 'combatantA',
    actorName: 'ZuKii',
    combatantAHpAfter: 83,
    combatantBHpAfter: 50,
    combatantAManaAfter: 60,
    combatantBManaAfter: 40,
    combatantAStaminaAfter: 70,
    combatantBStaminaAfter: 55,
    ...overrides,
  };
}

const sampleTicket = {
  publicId: 'SUP-PREVIEW1',
  status: 'new',
  privacy: 'private',
  category: 'bug',
  area: 'combat',
  sensitivityFlags: ['security'],
  title: 'Duel replay shows wrong HP',
  summary: 'The replay card reports 0 HP for the winner on the final round.',
  realmLabel: 'Realm 1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

async function main(): Promise<void> {
  const config: BotConfig = loadBotConfig();
  const channelId = resolveChannelId();
  const rest = new REST({ version: '10' }).setToken(config.token);
  const { emojiMap, webBaseUrl, clientId } = config;

  await postSectionLabel(rest, channelId, 'Duel cards');
  await postCard(rest, channelId, 'duel:challenge', buildChallengeCard({
    duelId: 'preview-duel',
    challengerMention: '@ZuKii',
    opponentMention: '@LuckyStar',
    opponentDiscordUserId: clientId,
  }));
  await postCard(rest, channelId, 'duel:result-win', buildResultCard({
    id: 'preview-duel',
    challengerUsername: 'ZuKii',
    targetUsername: 'LuckyStar',
    winnerUsername: 'ZuKii',
    isDraw: false,
    summary: { totalRounds: 11, challengerHpRemaining: 83, targetHpRemaining: 0 },
  }));
  await postCard(rest, channelId, 'duel:result-draw', buildResultCard({
    id: 'preview-duel',
    challengerUsername: 'ZuKii',
    targetUsername: 'LuckyStar',
    winnerUsername: null,
    isDraw: true,
    summary: { totalRounds: 15 },
  }));
  await postCard(rest, channelId, 'duel:decline', buildDeclineCard({ declinerMention: '@LuckyStar' }));
  await postCard(rest, channelId, 'duel:replay', buildReplayCard(sampleReplay));

  await postSectionLabel(rest, channelId, 'Support triage card');
  await postCard(rest, channelId, 'triage', buildTriageCard(sampleTicket, emojiMap));

  await postSectionLabel(rest, channelId, 'Notification DMs');
  await postCard(rest, channelId, 'notify:pvp_attack', buildNotificationCard(notificationEvent('pvp_attack', { attackerName: 'LuckyStar' }), webBaseUrl, emojiMap));
  await postCard(rest, channelId, 'notify:pvp_scout', buildNotificationCard(notificationEvent('pvp_scout', { scouterName: 'LuckyStar' }), webBaseUrl, emojiMap));
  await postCard(rest, channelId, 'notify:boss_appeared', buildNotificationCard(notificationEvent('boss_appeared', { bossName: 'Frostmaw', zoneName: 'Glacial Rift' }), webBaseUrl, emojiMap));
  await postCard(rest, channelId, 'notify:boss_defeated', buildNotificationCard(notificationEvent('boss_defeated', { bossName: 'Frostmaw' }), webBaseUrl, emojiMap));
  await postCard(rest, channelId, 'notify:expedition_recruiting', buildNotificationCard(notificationEvent('expedition_recruiting', { tier: 3 }), webBaseUrl, emojiMap));
  await postCard(rest, channelId, 'notify:expedition_finished-win', buildNotificationCard(notificationEvent('expedition_finished', { tier: 3, outcome: 'victory' }), webBaseUrl, emojiMap));
  await postCard(rest, channelId, 'notify:expedition_finished-fail', buildNotificationCard(notificationEvent('expedition_finished', { tier: 3, outcome: 'failed', attempts: 5 }), webBaseUrl, emojiMap));
  await postCard(rest, channelId, 'notify:turns_capped', buildNotificationCard(notificationEvent('turns_capped', { currentTurns: 2400, bankCap: 2400, username: 'ZuKii' }), webBaseUrl, emojiMap));

  await postSectionLabel(rest, channelId, 'Player command cards');
  await postCard(rest, channelId, 'player:profile', buildProfileCard({
    username: 'ZuKii',
    characterLevel: 42,
    activeTitle: 'Dragonslayer',
    realmLabel: 'Realm 1',
  }, emojiMap));
  await postCard(rest, channelId, 'player:turns', buildTurnsCard({
    currentTurns: 1850,
    timeToCapMs: 1000 * 60 * 90,
    lastRegenAt: '2026-01-01T00:00:00.000Z',
  }, emojiMap));
  await postCard(rest, channelId, 'player:skills', buildSkillsCard([
    { skillType: 'melee', level: 60, xp: 273_742 },
    { skillType: 'magic', level: 48, xp: 91_220 },
    { skillType: 'mining', level: 35, xp: 22_410 },
  ], emojiMap));
  await postCard(rest, channelId, 'player:skills-empty', buildSkillsCard([], emojiMap));
  await postCard(rest, channelId, 'player:rank', buildRankCard({
    category: 'arena',
    rank: 7,
    score: 1842,
    totalPlayers: 512,
    lastRefreshedAt: '2026-01-01T00:00:00.000Z',
  }, emojiMap));
  await postCard(rest, channelId, 'player:rank-unranked', buildRankCard({
    category: 'arena',
    rank: null,
    score: null,
  }, emojiMap));

  await postSectionLabel(rest, channelId, 'Notify panel');
  await postCard(rest, channelId, 'notify:panel', buildPreferenceCard(
    DISCORD_NOTIFICATION_TYPES.map((type, index) => ({ type, enabled: index % 2 === 0 })),
    emojiMap,
  ));

  await postSectionLabel(rest, channelId, 'Welcome card');
  await postCard(rest, channelId, 'welcome', buildWelcomeCard(clientId, config) as unknown as PreviewableCard);

  await postSectionLabel(rest, channelId, 'Status / error messages (representative)');
  await postCard(rest, channelId, 'status:success', statusCard('success', 'Posted', 'Friendly simulation challenge posted.', emojiMap));
  await postCard(rest, channelId, 'status:info', statusCard('info', 'Skills', 'No PocketRealm skills found yet.', emojiMap));
  await postCard(rest, channelId, 'status:warning', statusCard('warning', 'Link required', 'Link your PocketRealm account first with /link, then run /notify again.', emojiMap));
  await postCard(rest, channelId, 'status:error', statusCard('error', 'Report failed', 'Unable to create a report right now. Please try again later.', emojiMap));

  logger.info({ channelId }, 'Posted all preview cards. Delete them when finished.');
}

void main().catch((error) => {
  logger.error(
    { err: error instanceof Error ? error.message : error },
    'Failed to post card preview',
  );
  process.exit(1);
});
