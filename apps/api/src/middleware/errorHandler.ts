import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId;

  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? 'error' : 'warn';
    logger[level]({ requestId, statusCode: err.statusCode, code: err.code, ...(err.statusCode >= 500 && { err }) }, err.message);

    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const messages = err.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    const combined = messages.join('; ');
    logger.warn({ requestId, statusCode: 400, code: 'VALIDATION_ERROR' }, combined);

    res.status(400).json({
      error: {
        message: combined,
        code: 'VALIDATION_ERROR',
        requestId,
      },
    });
    return;
  }

  logger.error({ requestId, err }, err.message);

  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
    },
  });
}
