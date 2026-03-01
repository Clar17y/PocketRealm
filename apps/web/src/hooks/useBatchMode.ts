import { useCallback, useMemo, useState } from 'react';

export interface BatchMode {
  active: boolean;
  selection: Set<string>;
  busy: boolean;
  toggle: (id: string) => void;
  selectAll: (ids: string[]) => void;
  deselectAll: () => void;
  isAllSelected: (totalEligible: number) => boolean;
  activate: () => void;
  reset: () => void;
  setBusy: (v: boolean) => void;
}

export function useBatchMode(limit: number): BatchMode {
  const [active, setActive] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = useCallback((id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < limit) {
        next.add(id);
      }
      return next;
    });
  }, [limit]);

  const selectAll = useCallback((ids: string[]) => {
    setSelection(new Set(ids.slice(0, limit)));
  }, [limit]);

  const deselectAll = useCallback(() => {
    setSelection(new Set());
  }, []);

  const isAllSelected = useCallback((totalEligible: number) => {
    return selection.size === Math.min(totalEligible, limit);
  }, [selection.size, limit]);

  const activate = useCallback(() => {
    setActive(true);
    setSelection(new Set());
  }, []);

  const reset = useCallback(() => {
    setActive(false);
    setSelection(new Set());
    setBusy(false);
  }, []);

  return useMemo(() => ({
    active, selection, busy, toggle, selectAll, deselectAll, isAllSelected, activate, reset, setBusy,
  }), [active, selection, busy, toggle, selectAll, deselectAll, isAllSelected, activate, reset, setBusy]);
}
