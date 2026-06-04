import type { NextFunction, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from './errorHandler';
import { requireInternalBotAuth } from './internalBotAuth';

const VALID_KEY = 'test-bot-key-that-is-long-enough';
const ORIGINAL_KEY = process.env.DISCORD_INTERNAL_API_KEY;

function createRequest(botKey?: string): Request {
  return {
    header: vi.fn((name: string) => (name === 'x-pocketrealm-bot-key' ? botKey : undefined)),
  } as Partial<Request> as Request;
}

function captureAppError(action: () => void): AppError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    return error as AppError;
  }

  throw new Error('Expected middleware to throw AppError');
}

describe('requireInternalBotAuth', () => {
  beforeEach(() => {
    process.env.DISCORD_INTERNAL_API_KEY = VALID_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();

    if (ORIGINAL_KEY === undefined) {
      delete process.env.DISCORD_INTERNAL_API_KEY;
      return;
    }

    process.env.DISCORD_INTERNAL_API_KEY = ORIGINAL_KEY;
  });

  it('throws an unauthorized AppError when the bot key header is missing', () => {
    const next: NextFunction = vi.fn();
    const error = captureAppError(() => {
      requireInternalBotAuth(createRequest(), {} as Response, next);
    });

    expect(error.statusCode).toBe(401);
    expect(error.message).toContain('Bot API key missing');
    expect(error.code).toBe('BOT_UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next once when the bot key header is valid', () => {
    const next: NextFunction = vi.fn();

    requireInternalBotAuth(createRequest(VALID_KEY), {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledWith();
  });

  it('throws an unauthorized AppError when the bot key header is invalid', () => {
    const next: NextFunction = vi.fn();
    const error = captureAppError(() => {
      requireInternalBotAuth(createRequest('wrong-bot-key-that-is-long-enough'), {} as Response, next);
    });

    expect(error.statusCode).toBe(401);
    expect(error.message).toBe('Bot API key missing or invalid');
    expect(error.code).toBe('BOT_UNAUTHORIZED');
    expect(next).not.toHaveBeenCalled();
  });

  it('throws a configuration AppError when the expected bot key is missing', () => {
    delete process.env.DISCORD_INTERNAL_API_KEY;
    const next: NextFunction = vi.fn();
    const error = captureAppError(() => {
      requireInternalBotAuth(createRequest(VALID_KEY), {} as Response, next);
    });

    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Discord bot API key is not configured');
    expect(error.code).toBe('BOT_AUTH_NOT_CONFIGURED');
    expect(next).not.toHaveBeenCalled();
  });

  it('throws a configuration AppError when the expected bot key is too short', () => {
    process.env.DISCORD_INTERNAL_API_KEY = 'too-short';
    const next: NextFunction = vi.fn();
    const error = captureAppError(() => {
      requireInternalBotAuth(createRequest(VALID_KEY), {} as Response, next);
    });

    expect(error.statusCode).toBe(500);
    expect(error.message).toBe('Discord bot API key is not configured');
    expect(error.code).toBe('BOT_AUTH_NOT_CONFIGURED');
    expect(next).not.toHaveBeenCalled();
  });
});
