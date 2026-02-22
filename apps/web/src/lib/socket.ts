import { io, Socket } from 'socket.io-client';
import { resolveUrl } from './resolveUrl';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(resolveUrl(), {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  if (token) {
    s.auth = { token };
  }
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
