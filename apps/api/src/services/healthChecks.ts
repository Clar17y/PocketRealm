import type { Server as SocketServer } from 'socket.io';
import { prisma } from '@pocketrealm/database';
import { redis } from '../redis';
import { logger } from '../logger';

export type DependencyStatus = 'ok' | 'error';

export async function checkDatabase(): Promise<DependencyStatus> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch (err) {
    logger.warn({ err }, 'Health check: database probe failed');
    return 'error';
  }
}

export async function checkRedis(): Promise<DependencyStatus> {
  try {
    const reply = await redis.ping();
    return reply === 'PONG' ? 'ok' : 'error';
  } catch (err) {
    logger.warn({ err }, 'Health check: redis probe failed');
    return 'error';
  }
}

export function getSocketIoStats(io: SocketServer | null): { connected: number } {
  if (!io) return { connected: 0 };
  return { connected: io.sockets.sockets.size };
}
