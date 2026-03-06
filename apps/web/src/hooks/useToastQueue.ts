'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface ToastItem<T> {
  id: string;
  data: T;
}

interface UseToastQueueOptions {
  /** Window global function name to register (e.g. '__showQuestToast'). */
  globalKey: string;
  /** Max visible toasts before overflow count. */
  maxVisible?: number;
  /** Auto-dismiss after this many ms. 0 = no auto-dismiss. */
  autoDismissMs?: number;
  /** Transform raw data pushed via the global into { id, data }. */
  makeItem: (raw: unknown) => ToastItem<unknown>;
}

interface UseToastQueueResult<T> {
  visible: ToastItem<T>[];
  overflow: number;
  dismiss: (id: string) => void;
  clearAll: () => void;
  isEmpty: boolean;
}

export function useToastQueue<T>(options: {
  globalKey: string;
  maxVisible?: number;
  autoDismissMs?: number;
  makeItem: (raw: T) => ToastItem<T>;
}): UseToastQueueResult<T> {
  const { globalKey, maxVisible = 5, autoDismissMs = 0, makeItem } = options;
  const [toasts, setToasts] = useState<ToastItem<T>[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const makeItemRef = useRef(makeItem);
  makeItemRef.current = makeItem;

  useEffect(() => {
    (window as unknown as Record<string, unknown>)[globalKey] = (raw: T) => {
      const item = makeItemRef.current(raw);
      setToasts((prev) => [...prev, item]);

      if (autoDismissMs > 0) {
        const timer = setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== item.id));
          timersRef.current.delete(item.id);
        }, autoDismissMs);
        timersRef.current.set(item.id, timer);
      }
    };
    return () => {
      delete (window as unknown as Record<string, unknown>)[globalKey];
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    };
  }, [globalKey, autoDismissMs]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const clearAll = useCallback(() => {
    setToasts([]);
    for (const timer of timersRef.current.values()) clearTimeout(timer);
    timersRef.current.clear();
  }, []);

  const visible = toasts.slice(0, maxVisible);
  const overflow = Math.max(0, toasts.length - maxVisible);

  return { visible, overflow, dismiss, clearAll, isEmpty: toasts.length === 0 };
}
