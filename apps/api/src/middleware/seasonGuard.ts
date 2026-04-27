import { type NextFunction, type Request, type Response } from 'express';
import { SEASON_STATUSES } from '@pocketrealm/shared';
import { AppError } from './errorHandler';

/**
 * Blocks gameplay mutations for frozen seasonal characters while allowing
 * permanent-realm characters and read-only seasonal endpoints to continue.
 */
export function requireActiveSeason(req: Request, _res: Response, next: NextFunction): void {
  if (req.player?.seasonId && !req.season) {
    throw new AppError(
      503,
      'Season state is temporarily unavailable. Please retry in a moment.',
      'SEASON_STATE_UNAVAILABLE',
    );
  }

  if (req.season && req.season.status !== SEASON_STATUSES.ACTIVE) {
    throw new AppError(
      403,
      'This season has ended. Your character is frozen pending merge.',
      'SEASON_ENDED',
    );
  }

  next();
}
