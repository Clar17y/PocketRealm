import 'dotenv/config';

import pino from 'pino';

import { loadBotConfig } from '../config.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
});

const config = loadBotConfig();

logger.info(
  { clientId: config.clientId, guildId: config.guildId },
  'No Discord bot commands are registered by Task 10',
);
