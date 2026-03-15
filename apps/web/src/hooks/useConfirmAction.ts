import { useCallback, useState } from 'react';

/**
 * Manages pending-confirmation state for destructive actions.
 *
 * @example
 * const { pending, request, cancel, execute } = useConfirmAction<string>();
 * // Button: onClick={() => request(item.id)}
 * // Modal:  onConfirm={() => execute(handleDelete)}
 * //         onCancel={cancel}
 */
export function useConfirmAction<T = true>() {
  const [pending, setPending] = useState<T | null>(null);

  const request = useCallback((value: T) => setPending(value), []);
  const cancel = useCallback(() => setPending(null), []);

  /** Snapshot the pending value, clear state, then invoke `handler` with it. */
  const execute = useCallback((handler: (value: T) => void) => {
    if (pending == null) return;
    const value = pending;
    setPending(null);
    handler(value);
  }, [pending]);

  return { pending, request, cancel, execute } as const;
}
