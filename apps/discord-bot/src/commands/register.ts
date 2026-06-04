import 'dotenv/config';

import { REST, Routes } from 'discord.js';
import pino from 'pino';

import { loadBotConfig } from '../config.js';
import { buildCommandDefinitions } from './definitions.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
});

async function main(): Promise<void> {
  const config = loadBotConfig();
  const commands = buildCommandDefinitions();
  const rest = new REST({ version: '10' }).setToken(config.token);

  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: commands },
  );

  logger.info(
    { clientId: config.clientId, guildId: config.guildId, commandCount: commands.length },
    'Registered Discord bot guild commands',
  );
}

void main().catch((error) => {
  logger.error({ error }, 'Failed to register Discord bot guild commands');
  process.exit(1);
});
