import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '@pocketrealm/database';
import { AppError } from './errorHandler';
import { attachSentryUser } from './sentryContext';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET env var must be set and at least 32 characters');
}
export const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_TTL_MINUTES = Number.parseInt(process.env.ACCESS_TOKEN_TTL_MINUTES || '15', 10);
const REFRESH_TOKEN_TTL_DAYS = Number.parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
const SESSION_INACTIVITY_WINDOW_HOURS = Number.parseInt(process.env.SESSION_INACTIVITY_WINDOW_HOURS || '24', 10);
const LAST_ACTIVE_TOUCH_INTERVAL_SECONDS = Number.parseInt(process.env.LAST_ACTIVE_TOUCH_INTERVAL_SECONDS || '60', 10);

export const authConfig = {
  accessTokenTtlMinutes: Number.isFinite(ACCESS_TOKEN_TTL_MINUTES) && ACCESS_TOKEN_TTL_MINUTES > 0
    ? ACCESS_TOKEN_TTL_MINUTES
    : 15,
  refreshTokenTtlDays: Number.isFinite(REFRESH_TOKEN_TTL_DAYS) && REFRESH_TOKEN_TTL_DAYS > 0
    ? REFRESH_TOKEN_TTL_DAYS
    : 30,
  sessionInactivityWindowHours:
    Number.isFinite(SESSION_INACTIVITY_WINDOW_HOURS) && SESSION_INACTIVITY_WINDOW_HOURS > 0
      ? SESSION_INACTIVITY_WINDOW_HOURS
      : 24,
  lastActiveTouchIntervalSeconds:
    Number.isFinite(LAST_ACTIVE_TOUCH_INTERVAL_SECONDS) && LAST_ACTIVE_TOUCH_INTERVAL_SECONDS > 0
      ? LAST_ACTIVE_TOUCH_INTERVAL_SECONDS
      : 60,
} as const;

const lastActiveTouchByPlayerId = new Map<string, number>();

function touchPlayerLastActive(playerId: string): void {
  const nowMs = Date.now();
  const lastTouchedAt = lastActiveTouchByPlayerId.get(playerId);
  const minIntervalMs = authConfig.lastActiveTouchIntervalSeconds * 1000;

  if (typeof lastTouchedAt === 'number' && nowMs - lastTouchedAt < minIntervalMs) {
    return;
  }

  lastActiveTouchByPlayerId.set(playerId, nowMs);

  // Best-effort activity touch to keep auth flow non-blocking.
  void prisma.player.update({
    where: { id: playerId },
    data: { lastActiveAt: new Date(nowMs) },
  }).catch(() => {
    // Retry on a future request if this write fails.
    lastActiveTouchByPlayerId.delete(playerId);
  });
}

export interface AuthPayload {
  playerId: string;
  username: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      player?: AuthPayload;
      requestId?: string;
    }
  }
}

export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing or invalid authorization header', 'UNAUTHORIZED');
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.player = payload;
    touchPlayerLastActive(payload.playerId);
    attachSentryUser(req);
    next();
  } catch (err) {
    throw new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }
}

export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    attachSentryUser(req);
    return next();
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.player = payload;
    touchPlayerLastActive(payload.playerId);
  } catch {
    // Invalid token — proceed unauthenticated
  }

  attachSentryUser(req);
  next();
}

export function generateAccessToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: authConfig.accessTokenTtlMinutes * 60 });
}

export function generateRefreshToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: authConfig.refreshTokenTtlDays * 24 * 60 * 60,
    jwtid: randomUUID(),
  });
}

export function verifyRefreshToken(token: string): AuthPayload {
  const decoded = jwt.verify(token, JWT_SECRET);

  if (!decoded || typeof decoded !== 'object') {
    throw new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }

  const playerId = (decoded as { playerId?: unknown }).playerId;
  const username = (decoded as { username?: unknown }).username;
  const role = (decoded as { role?: unknown }).role;

  if (typeof playerId !== 'string' || typeof username !== 'string') {
    throw new AppError(401, 'Invalid or expired token', 'INVALID_TOKEN');
  }

  return { playerId, username, role: typeof role === 'string' ? role : 'player' };
}

export function refreshTokenExpiresAt(nowMs = Date.now()): Date {
  return new Date(nowMs + authConfig.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

export function sessionInactivityCutoff(nowMs = Date.now()): Date {
  return new Date(nowMs - authConfig.sessionInactivityWindowHours * 60 * 60 * 1000);
}
