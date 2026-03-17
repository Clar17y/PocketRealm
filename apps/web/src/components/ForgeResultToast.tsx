'use client';

import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

export interface ForgeResultData {
  type: 'upgrade_success' | 'upgrade_protected' | 'upgrade_fail' | 'reroll';
  message: string;
}

let _seq = 0;

export function ForgeResultToast() {
  const queue = useToastQueue<ForgeResultData>({
    globalKey: '__showForgeToast',
    maxVisible: 1,
    autoDismissMs: 3000,
    makeItem: (raw) => ({ id: `forge-${++_seq}`, data: raw }),
  });

  if (queue.isEmpty) return null;

  return (
    <ToastContainer
      position="top-right"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      renderToast={(item) => {
        const isSuccess = item.data.type === 'upgrade_success' || item.data.type === 'reroll';
        const isProtected = item.data.type === 'upgrade_protected';
        return (
          <div className="flex items-center gap-2">
            <span>{isSuccess ? '\u2728' : isProtected ? '\uD83D\uDEE1\uFE0F' : '\uD83D\uDCA5'}</span>
            <span className={
              isSuccess ? 'text-[var(--rpg-green-light)]'
                : isProtected ? 'text-[var(--rpg-blue-light)]'
                : 'text-[var(--rpg-red)]'
            }>
              {item.data.message}
            </span>
          </div>
        );
      }}
      cardClassName={(item) => {
        const isSuccess = item.data.type === 'upgrade_success' || item.data.type === 'reroll';
        const isProtected = item.data.type === 'upgrade_protected';
        const borderColor = isSuccess
          ? 'border-[var(--rpg-green-light)]'
          : isProtected
            ? 'border-[var(--rpg-blue-light)]'
            : 'border-[var(--rpg-red)]';
        return `bg-[var(--rpg-surface)] border ${borderColor} rounded-lg px-4 py-3 shadow-lg animate-[slideIn_0.3s_ease-out] min-w-[250px] transition-colors`;
      }}
    />
  );
}
