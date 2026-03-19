'use client';

import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useEffect, useRef, useState } from 'react';

const bannerBase = 'fixed top-0 left-0 right-0 z-50 text-[var(--rpg-text-primary)] text-center text-xs py-1';

export function ConnectionBanner() {
  const status = useConnectionStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasDisconnectedRef = useRef(false);

  useEffect(() => {
    if (status === 'disconnected' || status === 'reconnecting' || status === 'failed') {
      wasDisconnectedRef.current = true;
    } else if (status === 'connected' && wasDisconnectedRef.current) {
      wasDisconnectedRef.current = false;
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 2000);
      return () => clearTimeout(t);
    }
  }, [status]);

  if (status === 'connected' && !showReconnected) return null;

  if (showReconnected) {
    return (
      <div className={`${bannerBase} bg-[var(--rpg-green-dark)] animate-fadeIn`}>
        Connected
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className={`${bannerBase} bg-[var(--rpg-red)]`}>
        Connection lost.{' '}
        <button onClick={() => window.location.reload()} className="underline">
          Reload
        </button>
      </div>
    );
  }

  return (
    <div className={`${bannerBase} bg-[var(--rpg-red)]`}>
      {status === 'reconnecting' ? 'Reconnecting...' : 'Connection lost. Reconnecting...'}
    </div>
  );
}
