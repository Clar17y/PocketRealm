'use client';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

let _rateLimitSeq = 0;

export function RateLimitToast() {
  const queue = useToastQueue<string>({
    globalKey: '__showRateLimitToast',
    maxVisible: 1,
    autoDismissMs: 4000,
    makeItem: (msg) => ({ id: `rate-limit-${++_rateLimitSeq}`, data: msg }),
  });

  if (queue.isEmpty) return null;

  return (
    <ToastContainer
      position="top-right"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      overflowLabel=""
      renderToast={(item) => (
        <p className="text-sm font-medium text-[var(--rpg-gold)]">{item.data}</p>
      )}
    />
  );
}
