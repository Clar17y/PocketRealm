import 'dotenv/config';

import { Client, Events, GatewayIntentBits, type GuildMember } from 'discord.js';
import { Redis } from 'ioredis';
import pino from 'pino';

import { PocketRealmApiClient } from './api/pocketRealmApi.js';
import { loadBotConfig } from './config.js';
import { getDefaultDiscordPrisma } from './prismaTypes.js';
import { syncLinkedRoles } from './discord/roleSync.js';
import { shouldWelcomeAfterMemberUpdate, welcomeGuildMember } from './discord/welcome.js';
import { routeInteraction } from './interactions/interactionRouter.js';
import { pollSupportTriageTickets } from './support/triagePoll.js';
import { createMessageXpService } from './xp/messageXp.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
});

async function main(): Promise<void> {
  const config = loadBotConfig();
  const redis = new Redis(config.redisUrl);
  const api = new PocketRealmApiClient({
    baseUrl: config.apiBaseUrl,
    internalApiKey: config.internalApiKey,
  });
  const messageXp = createMessageXpService({
    prisma: getDefaultDiscordPrisma(),
    redis,
    config,
    logger,
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

  redis.on('error', (error: unknown) => {
    logger.warn({ error }, 'Discord XP Redis connection error');
  });

  const sendWelcomeForMember = async (member: GuildMember): Promise<void> => {
    try {
      const result = await welcomeGuildMember(member, { client, config });
      if (!result.sent) {
        logger.debug(
          {
            guildId: member.guild.id,
            discordUserId: member.id,
            reason: result.reason,
          },
          'Discord welcome skipped',
        );
      }
    } catch (error) {
      logger.warn(
        {
          error,
          guildId: member.guild.id,
          discordUserId: member.id,
        },
        'Failed to send Discord welcome message',
      );
    }
  };

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await routeInteraction(interaction, { api, config });
    } catch (error) {
      logger.warn({ error }, 'Failed to handle Discord interaction');
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      const result = await messageXp.grantXpForMessage(message);
      if (!result.eligible) {
        logger.debug(
          {
            guildId: message.guildId,
            channelId: message.channelId,
            discordUserId: message.author.id,
            reason: result.reason,
          },
          'Discord message XP skipped',
        );
        return;
      }

      logger.debug(
        {
          guildId: message.guildId,
          channelId: message.channelId,
          discordUserId: message.author.id,
          xpGranted: result.xpGranted,
          previousLevel: result.previousLevel,
          newLevel: result.newLevel,
        },
        'Discord message XP granted',
      );
    } catch (error) {
      logger.warn(
        {
          error,
          guildId: message.guildId,
          channelId: message.channelId,
          messageId: message.id,
        },
        'Failed to process Discord message XP',
      );
    }
  });

  client.on(Events.GuildMemberAdd, async (member) => {
    await sendWelcomeForMember(member);
  });

  client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
    if (!shouldWelcomeAfterMemberUpdate(oldMember, newMember)) {
      return;
    }

    await sendWelcomeForMember(newMember);
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
        await pollSupportTriageTickets({
          api,
          config,
          logger,
          readyClient,
          redis,
        });
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
    redis.disconnect();
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
