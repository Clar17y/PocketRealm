import { Request, Response, NextFunction } from 'express';
import { prisma } from '@pocketrealm/database';
import { AppError } from './errorHandler';

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const playerId = req.player?.playerId;
    if (!playerId) {
      throw new AppError(403, 'Admin access required', 'FORBIDDEN');
    }

    // Re-verify admin role from DB to catch revocations within access token lifetime
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { role: true },
    });
    if (player?.role !== 'admin') {
      throw new AppError(403, 'Admin access required', 'FORBIDDEN');
    }
    next();
  } catch (err) {
    next(err);
  }
}
