import http from 'http';
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import compression from 'compression';
import helmet from 'helmet';
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
import { chatRouter } from './routes/chat';
import { pvpRouter } from './routes/pvp';
import { worldEventsRouter } from './routes/worldEvents';
import { bossRouter } from './routes/boss';
import { achievementsRouter } from './routes/achievements';
import { leaderboardRouter } from './routes/leaderboard';
import { guildRouter } from './routes/guild';
import { adminRouter } from './routes/admin';
import { casinoRouter } from './routes/casino';
import { errorHandler } from './middleware/errorHandler';
import { createSocketServer, getIo } from './socket';
import { checkAndResolveDueBossRounds } from './services/bossEncounterService';
import { cleanupFullyHealedMobs } from './services/persistedMobService';
import { refreshAllLeaderboards } from './services/leaderboardService';
import { LEADERBOARD_CONSTANTS } from '@adventure/shared';

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
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
app.use('/api/v1/chat', chatRouter);
app.use('/api/v1/pvp', pvpRouter);
app.use('/api/v1/events', worldEventsRouter);
app.use('/api/v1/boss', bossRouter);
app.use('/api/v1/achievements', achievementsRouter);
app.use('/api/v1/leaderboard', leaderboardRouter);
app.use('/api/v1/guild', guildRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/casino', casinoRouter);

// Error handler
app.use(errorHandler);

const server = http.createServer(app);
createSocketServer(server, isAllowedCorsOrigin);

server.listen(PORT, () => {
  console.log(`Adventure API running on port ${PORT}`);

  // Boss round resolution timer (every 60 seconds)
  setInterval(() => {
    checkAndResolveDueBossRounds(getIo()).catch((err) => {
      console.error('Boss round resolution error:', err);
    });
  }, 60_000);

  // Persisted mob cleanup timer (every 5 minutes)
  setInterval(() => {
    cleanupFullyHealedMobs().catch((err) => {
      console.error('Persisted mob cleanup error:', err);
    });
  }, 300_000);

  // Leaderboard refresh (every 15 minutes)
  refreshAllLeaderboards().catch((err) => {
    console.error('Initial leaderboard refresh error:', err);
  });
  setInterval(() => {
    refreshAllLeaderboards().catch((err) => {
      console.error('Leaderboard refresh error:', err);
    });
  }, LEADERBOARD_CONSTANTS.REFRESH_INTERVAL_MS);
});
