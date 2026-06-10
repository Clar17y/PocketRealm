import { createHash, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler';

function safeEqual(a: string, b: string): boolean {
  const aDigest = createHash('sha256').update(a).digest();
  const bDigest = createHash('sha256').update(b).digest();
  return timingSafeEqual(aDigest, bDigest);
}

export function requireInternalBotAuth(req: Request, _res: Response, next: NextFunction): void {
  const expected = process.env.DISCORD_INTERNAL_API_KEY?.trim();
  if (!expected || expected.length < 32) {
    throw new AppError(500, 'Discord bot API key is not configured', 'BOT_AUTH_NOT_CONFIGURED');
  }

  const provided = req.header('x-pocketrealm-bot-key')?.trim();
  if (!provided || !safeEqual(provided, expected)) {
    throw new AppError(401, 'Bot API key missing or invalid', 'BOT_UNAUTHORIZED');
  }

  next();
}
