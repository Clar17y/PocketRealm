'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Manages a boolean toggle persisted in sessionStorage.
 * Reads stored value on mount, only writes back on user-initiated toggles (not on mount).
 */
export function useSessionStorageToggle(
  storageKey: string,
  defaultValue = false,
): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const isFirstRender = useRef(true);

  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    const stored = sessionStorage.getItem(storageKey);
    if (stored !== null) return stored === 'true';
    return defaultValue;
  });

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    sessionStorage.setItem(storageKey, String(value));
  }, [value, storageKey]);

  return [value, setValue];
}
