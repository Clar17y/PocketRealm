import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export function useConnectionStatus(): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connected');

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState('disconnected');
    const onReconnecting = () => setState('reconnecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnecting);

    // Set initial state
    if (!socket.connected) setState('disconnected');

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnecting);
    };
  }, []);

  return state;
}
