import { useState } from 'react';
import type { ActivityLogEntry } from '../gameController.types';

export function nowStamp(): string {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function useActivityLog() {
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);

  const pushLog = (...entries: ActivityLogEntry[]) => {
    setActivityLog((prev) => [...entries, ...prev].slice(0, 100));
  };

  return { activityLog, setActivityLog, pushLog } as const;
}
