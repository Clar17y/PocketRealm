import { Request, Response, NextFunction } from 'express';
import { prisma } from '@pocketrealm/database';
import { AppError } from './errorHandler';

export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.player?.accountId;
    if (!accountId) {
      throw new AppError(403, 'Admin access required', 'FORBIDDEN');
    }

    // Re-verify admin role from DB to catch revocations within access token lifetime
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { role: true },
    });
    if (account?.role !== 'admin') {
      throw new AppError(403, 'Admin access required', 'FORBIDDEN');
    }
    next();
  } catch (err) {
    next(err);
  }
}
