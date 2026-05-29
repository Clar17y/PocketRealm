// IMPORTANT: Sentry must be initialized before any other import so its
// auto-instrumentation can patch Node internals (http, express, prisma).
import './instrument';

import http from 'http';
import * as Sentry from '@sentry/node';
import 'dotenv/config';
import { createApp, createCorsOriginChecker } from './app';
import { markShuttingDown } from './services/healthChecks';
import { logger } from './logger';
import { APP_VERSION } from './version';
import { closeSocketAdapter, createSocketServer, getIo } from './socket';
import { redis } from './redis';
import { startMetricsLogger } from './services/metricsLogger';
import { startApiLatencySnapshotWriter } from './services/apiLatencyMetricsService';
import { startRealtimeBridge } from './services/realtimeBridge';
import { closeActivityWorkerPool } from './services/activityWorkerClient';
import { reconcileExpiredPremium } from './services/premiumReconciliation';
import { roundTimerRegistry } from './services/roundTimerRegistry';
import { refreshSeasonCache } from './services/seasonCacheService';
import { runWeeklyLeaderboardJob } from './jobs/weeklyLeaderboardJob';
import { msUntilNextWeeklyLeaderboardWindow } from './jobs/weeklyLeaderboardSchedule';

const PORT = process.env.PORT || 4000;
const isAllowedCorsOrigin = createCorsOriginChecker();
const app = createApp({ isAllowedCorsOrigin });
const server = http.createServer(app);

let stopMetricsLogger: (() => void) | null = null;
let stopLatencySnapshotWriter: (() => Promise<void>) | null = null;
let stopRealtimeBridge: (() => Promise<void>) | null = null;
let premiumReconciliationTimer: ReturnType<typeof setInterval> | null = null;
let weeklyLeaderboardTimer: ReturnType<typeof setTimeout> | null = null;

const PREMIUM_RECONCILIATION_INTERVAL_MS = 60 * 60 * 1000;

async function runPremiumReconciliation(): Promise<void> {
  try {
    await reconcileExpiredPremium();
  } catch (err) {
    logger.error({ err }, 'Premium reconciliation failed');
  }
}

function scheduleWeeklyLeaderboardJob(skipCurrentWindow = false): void {
  weeklyLeaderboardTimer = setTimeout(() => {
    const now = new Date();
    void runWeeklyLeaderboardJob(now)
      .catch((err) => {
        logger.error({ err }, 'Weekly leaderboard crown job failed');
      })
      .finally(() => {
        scheduleWeeklyLeaderboardJob(true);
      });
  }, msUntilNextWeeklyLeaderboardWindow(new Date(), { includeCurrentWindow: !skipCurrentWindow }));
}

async function startServer(): Promise<void> {
  const io = await createSocketServer(server, isAllowedCorsOrigin);

  server.listen(PORT, () => {
    logger.info({ port: PORT, version: APP_VERSION }, 'PocketRealm API running');
    stopRealtimeBridge = startRealtimeBridge(io);
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
    scheduleWeeklyLeaderboardJob();
    stopMetricsLogger = startMetricsLogger(getIo);
    stopLatencySnapshotWriter = startApiLatencySnapshotWriter(getIo);
  });
}

void startServer().catch((err) => {
  logger.error({ err }, 'API startup failed');
  void Sentry.flush(2000)
    .catch(() => undefined)
    .finally(() => process.exit(1));
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received - shutting down gracefully');
  markShuttingDown();
  stopMetricsLogger?.();
  if (premiumReconciliationTimer) clearInterval(premiumReconciliationTimer);
  if (weeklyLeaderboardTimer) clearTimeout(weeklyLeaderboardTimer);
  const io = getIo();
  if (io) io.close();
  server.close(() => {
    Promise.resolve()
      .then(() => stopLatencySnapshotWriter?.())
      .catch((err) => logger.error({ err }, 'API latency snapshot writer shutdown failed'))
      .then(() => closeActivityWorkerPool())
      .catch((err) => logger.error({ err }, 'Activity worker pool shutdown failed'))
      .then(() => stopRealtimeBridge?.())
      .catch((err) => logger.error({ err }, 'Realtime bridge shutdown failed'))
      .then(() => closeSocketAdapter())
      .catch((err) => logger.error({ err }, 'Socket adapter shutdown failed'))
      .then(() => redis.quit())
      .then(() => logger.info('Redis connection closed'))
      .catch((err) => logger.error({ err }, 'Redis quit error'))
      .then(() => Sentry.flush(2000).catch(() => undefined))
      .finally(() => process.exit(0));
  });
});
