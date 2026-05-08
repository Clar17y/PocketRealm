import { useEffect, useRef } from 'react';
import { checkApiReady } from '@/lib/api';
import { connectSocket, getSocket } from '@/lib/socket';
import type { ConnectionState } from './useConnectionStatus';

const RECOVERY_PROBE_THROTTLE_MS = 5_000;
const RECOVERY_EVENTS = ['focus', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;

function isForeground(): boolean {
  if (typeof document === 'undefined') return false;
  const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
  return document.visibilityState === 'visible' && hasFocus;
}

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
      if (statusRef.current === 'connected' || !isForeground() || probeInFlightRef.current) return;

      const now = Date.now();
      if (now - lastProbeAtRef.current < RECOVERY_PROBE_THROTTLE_MS) return;
      lastProbeAtRef.current = now;
      probeInFlightRef.current = true;

      void (async () => {
        try {
          const ok = await checkApiReady();
          dispatchApiReachable(ok);
          if (ok && !getSocket().connected) {
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
