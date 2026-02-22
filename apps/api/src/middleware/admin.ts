import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.player?.role !== 'admin') {
    throw new AppError(403, 'Admin access required', 'FORBIDDEN');
  }
  next();
}
