import 'dotenv/config';

import { Client, Events, GatewayIntentBits } from 'discord.js';
import pino from 'pino';

import { PocketRealmApiClient } from './api/pocketRealmApi.js';
import { loadBotConfig } from './config.js';
import { syncLinkedRoles } from './discord/roleSync.js';
import { routeInteraction } from './interactions/interactionRouter.js';
import { buildTriageCard, type UnpostedTicketsResponse } from './support/triageCards.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
});

async function main(): Promise<void> {
  const config = loadBotConfig();
  const api = new PocketRealmApiClient({
    baseUrl: config.apiBaseUrl,
    internalApiKey: config.internalApiKey,
  });
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
  });
  let roleSyncInterval: NodeJS.Timeout | undefined;
  let supportTriageInterval: NodeJS.Timeout | undefined;
  let isRoleSyncRunning = false;
  let isSupportTriageRunning = false;

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await routeInteraction(interaction, { api, config });
    } catch (error) {
      logger.warn({ error }, 'Failed to handle Discord interaction');
    }
  });

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ user: readyClient.user.tag }, 'Discord bot ready');

    try {
      const channel = await readyClient.channels.fetch(config.botHealthChannelId);
      if (channel?.isSendable()) {
        await channel.send({
          content: `Pocketrealm bot ready at ${new Date().toISOString()}`,
        });
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to post Discord bot health message');
    }

    const runRoleSync = async (): Promise<void> => {
      if (isRoleSyncRunning) {
        logger.debug('Discord linked role sync skipped because a previous run is still active');
        return;
      }

      isRoleSyncRunning = true;
      try {
        const guild = await readyClient.guilds.fetch(config.guildId);
        const summary = await syncLinkedRoles({ api, guild, config });
        logger.info({ summary }, 'Discord linked role sync completed');
      } catch (error) {
        logger.warn({ error }, 'Discord linked role sync failed');
      } finally {
        isRoleSyncRunning = false;
      }
    };

    void runRoleSync();
    roleSyncInterval = setInterval(() => {
      void runRoleSync();
    }, 60_000);

    const runSupportTriagePoll = async (): Promise<void> => {
      if (isSupportTriageRunning) {
        logger.debug('Discord support triage poll skipped because a previous run is still active');
        return;
      }

      isSupportTriageRunning = true;
      try {
        const channel = await readyClient.channels.fetch(config.supportTriageChannelId);
        if (!channel?.isSendable()) {
          logger.warn(
            { channelId: config.supportTriageChannelId },
            'Discord support triage channel is not sendable',
          );
          return;
        }

        const { tickets } = await api.get<UnpostedTicketsResponse>(
          '/api/v1/discord/support/tickets/unposted',
        );

        for (const ticket of tickets) {
          try {
            const message = await channel.send(buildTriageCard(ticket));
            await api.post(`/api/v1/discord/support/tickets/${ticket.publicId}/triage-message`, {
              guildId: config.guildId,
              triageChannelId: config.supportTriageChannelId,
              triageMessageId: message.id,
            });
          } catch (error) {
            logger.warn({ error, publicId: ticket.publicId }, 'Failed to post Discord support triage card');
          }
        }
      } catch (error) {
        logger.warn({ error }, 'Discord support triage poll failed');
      } finally {
        isSupportTriageRunning = false;
      }
    };

    void runSupportTriagePoll();
    supportTriageInterval = setInterval(() => {
      void runSupportTriagePoll();
    }, 30_000);
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down Discord bot');
    if (roleSyncInterval) {
      clearInterval(roleSyncInterval);
    }
    if (supportTriageInterval) {
      clearInterval(supportTriageInterval);
    }
    client.destroy();
    process.exit(0);
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await client.login(config.token);
}

if (process.env.NODE_ENV !== 'test') {
  void main().catch((error) => {
    logger.error({ error }, 'Discord bot failed to start');
    process.exit(1);
  });
}
