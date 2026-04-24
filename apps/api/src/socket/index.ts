import { Server as SocketServer, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { authenticateSocket } from './socketAuth';
import { registerChatHandlers } from './chatHandlers';

let ioInstance: SocketServer | null = null;
const MAX_TIMEOUT_MS = 2_147_483_647;

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

export function createSocketServer(
  httpServer: HttpServer,
  isAllowedOrigin: (origin: string) => boolean,
): SocketServer {
  // TODO: Add @socket.io/redis-adapter for multi-instance deployment.
  // See: https://socket.io/docs/v4/redis-adapter/
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

  return io;
}
