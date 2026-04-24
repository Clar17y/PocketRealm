import jwt from 'jsonwebtoken';
import type { Socket } from 'socket.io';
import { type AuthPayload, JWT_SECRET } from '../middleware/auth';

export interface SocketPlayerData {
  accountId: string;
  playerId: string;
  username: string;
  seasonId: string | null;
  role: string;
  accessTokenExpiresAt: number;
}

export function authenticateSocket(socket: Socket, next: (err?: Error) => void): void {
  const token = socket.handshake.auth?.token as string | undefined;

  if (!token) {
    return next(new Error('Missing auth token'));
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthPayload & { exp?: number };
    if (typeof payload.exp !== 'number') {
      return next(new Error('Invalid or expired token'));
    }

    socket.data = {
      accountId: payload.accountId,
      playerId: payload.playerId,
      username: payload.username,
      seasonId: payload.seasonId,
      role: payload.role,
      accessTokenExpiresAt: payload.exp * 1000,
    } satisfies SocketPlayerData;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
