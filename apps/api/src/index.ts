// IMPORTANT: Sentry must be initialized before any other import so its
// auto-instrumentation can patch Node internals (http, express, prisma).
import './instrument';

import http from 'http';
import { randomUUID } from 'crypto';
import express from 'express';
import * as Sentry from '@sentry/node';
import cors from 'cors';
import 'dotenv/config';
import compression from 'compression';
import helmet from 'helmet';
import { createEndpointLimiter } from './middleware/rateLimiter';
import { RATE_LIMIT_CONSTANTS } from '@pocketrealm/shared';
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
import { healthRouter } from './routes/health';
import { premiumRouter } from './routes/premium';
import { premiumWebhookRouter } from './routes/premiumWebhook';
import { markShuttingDown } from './services/healthChecks';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { sentryContext } from './middleware/sentryContext';
import { logger } from './logger';
import { APP_VERSION } from './version';
import { createSocketServer, getIo } from './socket';
import { redis } from './redis';
import { startMetricsLogger } from './services/metricsLogger';
import { reconcileExpiredPremium } from './services/premiumReconciliation';
import { roundTimerRegistry } from './services/roundTimerRegistry';
import { refreshSeasonCache } from './services/seasonCacheService';

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

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

const configuredCorsOrigins = new Set(parseConfiguredCorsOrigins());

function isAllowedCorsOrigin(origin: string): boolean {
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
}

// Middleware
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
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.use((req, res, next) => {
  const clientId = req.headers['x-request-id'] as string | undefined;
  const id = (clientId && UUID_REGEX.test(clientId)) ? clientId : randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
});

app.use(requestLogger);
app.use(sentryContext);

// Trust the first proxy hop (e.g. nginx/Caddy) so Express resolves req.ip
// to the real client IP rather than the reverse proxy's address.  Without
// this the rate limiter would bucket every user under the same proxy IP.
app.set('trust proxy', 1);

// Global rate limiter: 120 requests per minute per IP
// Skip CORS preflight (OPTIONS) — they carry no payload and shouldn't count against the limit.
app.use('/api/v1/', createEndpointLimiter('global', RATE_LIMIT_CONSTANTS.DEFAULT_WINDOW_MS, RATE_LIMIT_CONSTANTS.GLOBAL_MAX, {
  skip: (req) => req.method === 'OPTIONS' || req.path === '/premium/webhook/stripe',
}));

// Health / readiness / liveness checks (see docs/reference/deployment.md)
app.use(healthRouter);
app.use('/api/v1/premium/webhook', premiumWebhookRouter);
app.use(express.json({ limit: '100kb' }));

// API routes
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

// Sentry's Express error handler — captures errors before our own
// errorHandler formats the response. `beforeSend` in instrument.ts
// drops 4xx AppErrors so only true server errors get reported.
Sentry.setupExpressErrorHandler(app);

// Error handler
app.use(errorHandler);

const server = http.createServer(app);
createSocketServer(server, isAllowedCorsOrigin);

let stopMetricsLogger: (() => void) | null = null;
let premiumReconciliationTimer: ReturnType<typeof setInterval> | null = null;

const PREMIUM_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1000;

async function runPremiumReconciliation(): Promise<void> {
  try {
    await reconcileExpiredPremium();
  } catch (err) {
    logger.error({ err }, 'Premium reconciliation failed');
  }
}

function startServer(): void {
  server.listen(PORT, () => {
    logger.info({ port: PORT, version: APP_VERSION }, 'PocketRealm API running');
    void refreshSeasonCache().catch((err) => {
      logger.error({ err }, 'Season cache init failed');
    });
    void roundTimerRegistry.rehydrate(getIo).catch((err) => {
      logger.error({ err }, 'Round timer registry rehydrate failed');
    });
    void runPremiumReconciliation();
    premiumReconciliationTimer = setInterval(() => {
      void runPremiumReconciliation();
    }, PREMIUM_RECONCILIATION_INTERVAL_MS);
    stopMetricsLogger = startMetricsLogger(getIo);
  });
}

startServer();

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  // Flip /health/ready to 503 before closing anything so the load balancer
  // drains traffic during the graceful-shutdown window.
  markShuttingDown();
  stopMetricsLogger?.();
  if (premiumReconciliationTimer) clearInterval(premiumReconciliationTimer);
  const io = getIo();
  if (io) io.close();
  server.close(() => {
    redis.quit()
      .then(() => logger.info('Redis connection closed'))
      .catch((err) => logger.error({ err }, 'Redis quit error'))
      // Flush any Sentry events captured during the drain window before
      // process.exit drops the transport buffer.
      .then(() => Sentry.flush(2000).catch(() => undefined))
      .finally(() => process.exit(0));
  });
});
