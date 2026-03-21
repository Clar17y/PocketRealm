import { useState, useEffect, useRef } from 'react';

export function useApiReachable(): boolean {
  const [reachable, setReachable] = useState(true);
  const failCountRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (e: Event) => {
      const ok = (e as CustomEvent<{ ok: boolean }>).detail.ok;
      if (ok) {
        failCountRef.current = 0;
        setReachable(true);
      } else {
        failCountRef.current += 1;
        if (failCountRef.current >= 2) {
          setReachable(false);
        }
      }
    };

    window.addEventListener('api:reachable', handler);
    return () => window.removeEventListener('api:reachable', handler);
  }, []);

  return reachable;
}
