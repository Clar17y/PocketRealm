import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

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
  console.error(`Error [${requestId}]:`, err);

  if (err instanceof AppError) {
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
    res.status(400).json({
      error: {
        message: messages.join('; '),
        code: 'VALIDATION_ERROR',
        requestId,
      },
    });
    return;
  }

  // Default to 500
  res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId,
    },
  });
}
