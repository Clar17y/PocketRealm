import { randomUUID } from 'crypto';
import express from 'express';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { RATE_LIMIT_CONSTANTS } from '@pocketrealm/shared';
import { createEndpointLimiter } from './middleware/rateLimiter';
import { requestLogger } from './middleware/requestLogger';
import { sentryContext } from './middleware/sentryContext';
import { apiLatencyRecorder } from './middleware/apiLatencyRecorder';
import { errorHandler } from './middleware/errorHandler';
import { healthRouter } from './routes/health';
import { premiumWebhookRouter } from './routes/premiumWebhook';
import { authRouter } from './routes/auth';
import { turnsRouter } from './routes/turns';
import { playerRouter } from './routes/player';
import { explorationRouter } from './routes/exploration';
import { zonesRouter } from './routes/zones';
import { combatRouter } from './routes/combat/index';
import { inventoryRouter } from './routes/inventory';
import { equipmentRouter } from './routes/equipment';
import { gatheringRouter } from './routes/gathering';
import { craftingRouter } from './routes/crafting';
import { bestiaryRouter } from './routes/bestiary';
import { hpRouter } from './routes/hp';
import { resourcesRouter } from './routes/resources';
import { chatRouter } from './routes/chat';
import { pvpRouter } from './routes/pvp';
import { worldEventsRouter } from './routes/worldEvents';
import { bossRouter } from './routes/boss';
import { achievementsRouter } from './routes/achievements';
import { leaderboardRouter } from './routes/leaderboard';
import { seasonsRouter } from './routes/seasons';
import { guildRouter } from './routes/guild';
import { adminRouter } from './routes/admin';
import { templatesRouter } from './routes/templates';
import { skillPointsRouter } from './routes/skillpoints';
import { casinoRouter } from './routes/casino';
import { trainingRouter } from './routes/training';
import { questsRouter } from './routes/quests';
import { expeditionRouter } from './routes/expedition';
import { shopRouter } from './routes/shop';
import { friendsRouter } from './routes/friends';
import { notificationsRouter } from './routes/notifications';
import { premiumRouter } from './routes/premium';

interface CorsOriginCheckerOptions {
  isProduction?: boolean;
}

interface CreateAppOptions {
  isAllowedCorsOrigin: (origin: string) => boolean;
}

function parseConfiguredCorsOrigins(): string[] {
  const raw =
    process.env.CORS_ORIGINS
    ?? process.env.CORS_ORIGIN
    ?? 'http://localhost:3002,http://127.0.0.1:3002';

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function createCorsOriginChecker(options: CorsOriginCheckerOptions = {}): (origin: string) => boolean {
  const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';
  const configuredCorsOrigins = new Set(parseConfiguredCorsOrigins());

  return (origin: string): boolean => {
    if (configuredCorsOrigins.has(origin)) return true;

    // In non-production, allow any origin on port 3002 for LAN playtesting.
    if (!isProduction) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        return parsed.port === '3002';
      } catch {
        return false;
      }
    }

    return false;
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createApp({ isAllowedCorsOrigin }: CreateAppOptions): express.Express {
  const app = express();

  app.use(helmet());
  app.use(compression());
  app.use(cors({
    origin: (origin, callback) => {
      // Allow non-browser or same-origin requests without Origin header.
      if (!origin) return callback(null, true);
      if (isAllowedCorsOrigin(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }));

  // Request ID: use client-provided header only if it is a valid UUID,
  // otherwise generate a fresh one to prevent log injection attacks.
  app.use((req, res, next) => {
    const clientId = req.headers['x-request-id'] as string | undefined;
    const id = (clientId && UUID_REGEX.test(clientId)) ? clientId : randomUUID();
    req.requestId = id;
    res.setHeader('x-request-id', id);
    next();
  });

  app.use(requestLogger);
  app.use(sentryContext);
  app.use(apiLatencyRecorder);

  // Trust the first proxy hop (e.g. nginx/Caddy) so Express resolves req.ip
  // to the real client IP rather than the reverse proxy's address.
  app.set('trust proxy', 1);

  app.use('/api/v1/', createEndpointLimiter('global', RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS, RATE_LIMIT_CONSTANTS.GLOBAL_MAX, {
    skip: (req) => req.method === 'OPTIONS' || req.path === '/premium/webhook/stripe',
  }));

  // Health and Stripe webhook routes must stay before JSON parsing.
  app.use(healthRouter);
  app.use('/api/v1/premium/webhook', premiumWebhookRouter);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/turns', turnsRouter);
  app.use('/api/v1/player', playerRouter);
  app.use('/api/v1/exploration', explorationRouter);
  app.use('/api/v1/zones', zonesRouter);
  app.use('/api/v1/combat', combatRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/equipment', equipmentRouter);
  app.use('/api/v1/gathering', gatheringRouter);
  app.use('/api/v1/crafting', craftingRouter);
  app.use('/api/v1/bestiary', bestiaryRouter);
  app.use('/api/v1/hp', hpRouter);
  app.use('/api/v1/resources', resourcesRouter);
  app.use('/api/v1/chat', chatRouter);
  app.use('/api/v1/pvp', pvpRouter);
  app.use('/api/v1/events', worldEventsRouter);
  app.use('/api/v1/boss', bossRouter);
  app.use('/api/v1/achievements', achievementsRouter);
  app.use('/api/v1/leaderboard', leaderboardRouter);
  app.use('/api/v1/seasons', seasonsRouter);
  app.use('/api/v1/guild', guildRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/templates', templatesRouter);
  app.use('/api/v1/skillpoints', skillPointsRouter);
  app.use('/api/v1/casino', casinoRouter);
  app.use('/api/v1/training', trainingRouter);
  app.use('/api/v1/quests', questsRouter);
  app.use('/api/v1/expedition', expeditionRouter);
  app.use('/api/v1/shop', shopRouter);
  app.use('/api/v1/friends', friendsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/premium', premiumRouter);

  Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
