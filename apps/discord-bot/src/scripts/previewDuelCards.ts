import 'dotenv/config';

import { REST, Routes } from 'discord.js';
import pino from 'pino';

import { loadBotConfig } from '../config.js';
import {
  buildChallengeCard,
  buildReplayCard,
  buildResultCard,
  type DuelCardPayload,
} from '../discord/duelCard.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

/**
 * Posts sample duel cards (challenge, result win, result draw, replay) to a
 * channel so the Components V2 layout + uploaded emoji can be eyeballed at real
 * size without running a live duel. The bot must be able to send messages in
 * the target channel; a private #bot-test channel works well. Buttons render
 * but are inert here (no backing duel) — delete the messages when done.
 *
 * Usage: npm run preview-duel-cards -- <channelId>
 */
function resolveChannelId(): string {
  const channelId = process.argv[2] ?? process.env.DUEL_PREVIEW_CHANNEL_ID;
  if (!channelId) {
    throw new Error('Pass a channel id as an argument or set DUEL_PREVIEW_CHANNEL_ID.');
  }
  return channelId;
}

async function postCard(rest: REST, channelId: string, label: string, card: DuelCardPayload): Promise<void> {
  await rest.post(Routes.channelMessages(channelId), {
    body: {
      flags: card.flags,
      components: card.components.map((component) => component.toJSON()),
      allowed_mentions: { parse: [] }, // never ping during a preview
    },
  });
  logger.info({ label }, 'Posted preview card');
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
    base({ round: 1, action: 'attack', actionName: 'Power Strike', damage: 23, targetDefence: 10, hitChance: 0.8, hitRollValue: 0.2 }),
    base({ round: 2, action: 'attack', actionName: 'Quick Jab', targetDefence: 8, hitChance: 0.6, hitRollValue: 0.9 }),
    base({ round: 3, action: 'spell', spellName: 'Firebolt', actionName: 'Firebolt', damage: 18, targetMagicDefence: 5, hitChance: 0.7, hitRollValue: 0.1 }),
    base({ round: 4, action: 'spell', spellName: 'Frost Lance', actionName: 'Frost Lance', damage: 30, targetMagicDefence: 5, isCritical: true, hitChance: 0.7, hitRollValue: 0.1 }),
    base({ round: 5, action: 'heal', spellName: 'Mend', actionName: 'Mend', healAmount: 30, healResourceType: 'hp' }),
    base({ round: 6, action: 'heal', spellName: 'Second Wind', actionName: 'Second Wind', healAmount: 20, healResourceType: 'stamina' }),
    base({ round: 7, action: 'defend', actionId: 'defend', actionName: 'Guard' }),
    base({ round: 8, action: 'defend', actionId: 'counter', actionName: 'Riposte', damage: 12 }),
    base({ round: 9, action: 'defend', actionId: 'ward', actionName: 'Aegis' }),
    base({ round: 10, action: 'potion', actionName: 'Healing Draught', healAmount: 30, healResourceType: 'hp' }),
    base({ round: 11, action: 'attack', actionName: 'Execute', damage: 40, targetDefence: 10, isCritical: true, hitChance: 0.9, hitRollValue: 0.1, combatantBHpAfter: 0 }),
  ],
};

function base(overrides: Record<string, unknown>): Record<string, unknown> {
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

async function main(): Promise<void> {
  const config = loadBotConfig();
  const channelId = resolveChannelId();
  const rest = new REST({ version: '10' }).setToken(config.token);

  await postCard(rest, channelId, 'challenge', buildChallengeCard({
    duelId: 'preview-duel',
    challengerMention: '@ZuKii',
    opponentMention: '@LuckyStar',
    opponentDiscordUserId: config.clientId,
  }));
  await postCard(rest, channelId, 'result-win', buildResultCard({
    id: 'preview-duel',
    challengerUsername: 'ZuKii',
    targetUsername: 'LuckyStar',
    winnerUsername: 'ZuKii',
    isDraw: false,
    summary: { totalRounds: 11, challengerHpRemaining: 83, targetHpRemaining: 0 },
  }));
  await postCard(rest, channelId, 'result-draw', buildResultCard({
    id: 'preview-duel',
    challengerUsername: 'ZuKii',
    targetUsername: 'LuckyStar',
    winnerUsername: null,
    isDraw: true,
    summary: { totalRounds: 15 },
  }));
  await postCard(rest, channelId, 'replay', buildReplayCard(sampleReplay));

  logger.info({ channelId }, 'Posted all preview cards. Delete them when finished.');
}

void main().catch((error) => {
  logger.error(
    { err: error instanceof Error ? error.message : error },
    'Failed to post duel preview cards',
  );
  process.exit(1);
});
