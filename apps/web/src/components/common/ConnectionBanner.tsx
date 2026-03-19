'use client';

import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useEffect, useState } from 'react';

export function ConnectionBanner() {
  const status = useConnectionStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const [wasDisconnected, setWasDisconnected] = useState(false);

  useEffect(() => {
    if (status === 'disconnected' || status === 'reconnecting' || status === 'failed') {
      setWasDisconnected(true);
    } else if (status === 'connected' && wasDisconnected) {
      setShowReconnected(true);
      setWasDisconnected(false);
      const t = setTimeout(() => setShowReconnected(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status, wasDisconnected]);

  if (status === 'connected' && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--rpg-green-dark)] text-[var(--rpg-text-primary)] text-center text-xs py-1 animate-fadeIn">
        Connected
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--rpg-red)] text-[var(--rpg-text-primary)] text-center text-xs py-1">
        Connection lost.{' '}
        <button onClick={() => window.location.reload()} className="underline">
          Reload
        </button>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-[var(--rpg-red)] text-[var(--rpg-text-primary)] text-center text-xs py-1">
      {status === 'reconnecting' ? 'Reconnecting...' : 'Connection lost. Reconnecting...'}
    </div>
  );
}
