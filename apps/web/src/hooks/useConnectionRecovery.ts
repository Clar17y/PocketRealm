import { useEffect, useRef } from 'react';
import { checkApiReady, ensureFreshAccessToken } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import { isPageVisibleAndFocused } from './usePageVisible';
import type { ConnectionState } from './useConnectionStatus';

const RECOVERY_PROBE_THROTTLE_MS = 5_000;
const RECOVERY_EVENTS = ['focus', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function dispatchApiReachable(ok: boolean): void {
  window.dispatchEvent(new CustomEvent('api:reachable', { detail: { ok } }));
}

export function useConnectionRecovery(status: ConnectionState): void {
  const statusRef = useRef(status);
  const lastProbeAtRef = useRef(-RECOVERY_PROBE_THROTTLE_MS);
  const probeInFlightRef = useRef(false);

  statusRef.current = status;

  useEffect(() => {
    if (status === 'connected' || typeof window === 'undefined') return;

    const runProbe = () => {
      if (statusRef.current === 'connected' || !isPageVisibleAndFocused() || probeInFlightRef.current) return;

      const now = Date.now();
      if (now - lastProbeAtRef.current < RECOVERY_PROBE_THROTTLE_MS) return;
      lastProbeAtRef.current = now;
      probeInFlightRef.current = true;

      void (async () => {
        try {
          const ok = await checkApiReady();
          dispatchApiReachable(ok);
          const tokenReady = ok ? await ensureFreshAccessToken() : false;
          if (tokenReady && !getSocket().connected) {
            connectSocket();
          }
        } finally {
          probeInFlightRef.current = false;
        }
      })();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') runProbe();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    for (const eventName of RECOVERY_EVENTS) {
      window.addEventListener(eventName, runProbe, { passive: true });
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      for (const eventName of RECOVERY_EVENTS) {
        window.removeEventListener(eventName, runProbe);
      }
    };
  }, [status]);
}
