import 'dotenv/config';

import { Client, Events, GatewayIntentBits } from 'discord.js';
import pino from 'pino';

import { loadBotConfig } from './config.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
});

async function main(): Promise<void> {
  const config = loadBotConfig();
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers,
    ],
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
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down Discord bot');
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
