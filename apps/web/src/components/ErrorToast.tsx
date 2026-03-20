'use client';
import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

let _errorSeq = 0;

export function ErrorToast() {
  const queue = useToastQueue<string>({
    globalKey: '__showErrorToast',
    maxVisible: 1,
    autoDismissMs: 5000,
    makeItem: (msg) => ({ id: `error-${++_errorSeq}`, data: msg }),
  });

  if (queue.isEmpty) return null;

  return (
    <ToastContainer
      position="top-left"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      overflowLabel=""
      renderToast={(item) => (
        <p className="text-sm font-medium text-[var(--rpg-red)]">{item.data}</p>
      )}
    />
  );
}
