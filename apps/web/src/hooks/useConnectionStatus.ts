import { useState, useEffect } from 'react';
import { getSocket } from '@/lib/socket';

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'failed';

export function useConnectionStatus(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(() =>
    getSocket().connected ? 'connected' : 'disconnected',
  );

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => setState('connected');
    const onDisconnect = () => setState('disconnected');
    const onReconnecting = () => setState('reconnecting');
    const onReconnectFailed = () => setState('failed');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnecting);
    socket.io.on('reconnect_failed', onReconnectFailed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnecting);
      socket.io.off('reconnect_failed', onReconnectFailed);
    };
  }, []);

  return state;
}
