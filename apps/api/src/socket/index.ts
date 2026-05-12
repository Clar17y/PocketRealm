import { Server as SocketServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'http';
import { authenticateSocket } from './socketAuth';
import { registerChatHandlers } from './chatHandlers';
import { logger } from '../logger';

let ioInstance: SocketServer | null = null;
let closeAdapterClients: (() => Promise<void>) | null = null;
const MAX_TIMEOUT_MS = 2_147_483_647;
const ADAPTER_CONNECT_TIMEOUT_MS = 2_000;

export function getIo(): SocketServer | null {
  return ioInstance;
}

function disconnectSocketsInRoom(room: string, reason: string): void {
  const io = getIo();
  if (!io) return;

  io.to(room).emit('session:revoked', { reason });
  io.in(room).disconnectSockets(true);
}

export function disconnectPlayerSockets(playerId: string, reason = 'session_revoked'): void {
  disconnectSocketsInRoom(playerId, reason);
}

export function disconnectAccountSockets(accountId: string, reason = 'session_revoked'): void {
  disconnectSocketsInRoom(accountId, reason);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

async function configureRedisAdapter(io: SocketServer): Promise<void> {
  const { redis } = await import('../redis.js');
  const pubClient = redis.duplicate({ lazyConnect: true });
  const subClient = redis.duplicate({ lazyConnect: true });

  pubClient.on('error', (err) => {
    logger.error({ err }, 'Socket.IO Redis adapter publisher error');
  });
  subClient.on('error', (err) => {
    logger.error({ err }, 'Socket.IO Redis adapter subscriber error');
  });

  try {
    await withTimeout(
      Promise.all([pubClient.connect(), subClient.connect()]),
      ADAPTER_CONNECT_TIMEOUT_MS,
      'Socket.IO Redis adapter connection timed out',
    );
    io.adapter(createAdapter(pubClient, subClient));
    closeAdapterClients = async () => {
      await Promise.allSettled([pubClient.quit(), subClient.quit()]);
      closeAdapterClients = null;
    };
    logger.info('Socket.IO Redis adapter enabled');
  } catch (err) {
    pubClient.disconnect();
    subClient.disconnect();
    logger.warn({ err }, 'Socket.IO Redis adapter unavailable; using local adapter');
  }
}

export async function closeSocketAdapter(): Promise<void> {
  await closeAdapterClients?.();
}

function scheduleAccessTokenExpiryDisconnect(socket: Socket): void {
  const expiresAt = socket.data.accessTokenExpiresAt;
  if (typeof expiresAt !== 'number') {
    socket.disconnect(true);
    return;
  }

  const delayMs = expiresAt - Date.now();
  if (delayMs <= 0) {
    socket.disconnect(true);
    return;
  }

  const timeout = setTimeout(() => {
    socket.disconnect(true);
  }, Math.min(delayMs, MAX_TIMEOUT_MS));

  socket.on('disconnect', () => {
    clearTimeout(timeout);
  });
}

export async function createSocketServer(
  httpServer: HttpServer,
  isAllowedOrigin: (origin: string) => boolean,
): Promise<SocketServer> {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    },
  });

  ioInstance = io;

  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    scheduleAccessTokenExpiryDisconnect(socket);
    socket.join(socket.data.accountId);
    socket.join(socket.data.playerId);
    registerChatHandlers(io, socket);
  });

  await configureRedisAdapter(io);
  return io;
}
