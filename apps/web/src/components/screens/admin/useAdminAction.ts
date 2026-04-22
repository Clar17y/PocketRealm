import { useState } from 'react';

export type StatusMessage = {
  text: string;
  ok: boolean;
};

export function useAdminAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<StatusMessage | null>(null);

  const act = async <T,>(
    label: string,
    fn: () => Promise<{ data?: T; error?: { message: string } }>,
    confirm?: string,
  ): Promise<T | null> => {
    if (busy) return null;
    if (confirm && !window.confirm(confirm)) return null;
    setBusy(true);
    setMsg(null);

    try {
      const res = await fn();
      if (res.error) {
        setMsg({ text: `${label} failed: ${res.error.message}`, ok: false });
        return null;
      }

      setMsg({ text: `${label} succeeded`, ok: true });
      return res.data ?? null;
    } finally {
      setBusy(false);
    }
  };

  return { busy, msg, setMsg, act };
}
