import { type NextFunction, type Request, type Response } from 'express';
import { AppError } from './errorHandler';

/**
 * Blocks gameplay mutations for frozen seasonal characters while allowing
 * permanent-realm characters and read-only seasonal endpoints to continue.
 */
export function requireActiveSeason(req: Request, _res: Response, next: NextFunction): void {
  if (req.season && req.season.status !== 'active') {
    throw new AppError(
      403,
      'This season has ended. Your character is frozen pending merge.',
      'SEASON_ENDED',
    );
  }

  next();
}
