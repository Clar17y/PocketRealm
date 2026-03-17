'use client';

import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

export interface ForgeResultData {
  type: 'upgrade_success' | 'upgrade_protected' | 'upgrade_fail' | 'reroll';
  message: string;
}

type ForgeOutcome = 'success' | 'protected' | 'fail';

function forgeOutcome(type: ForgeResultData['type']): ForgeOutcome {
  if (type === 'upgrade_success' || type === 'reroll') return 'success';
  if (type === 'upgrade_protected') return 'protected';
  return 'fail';
}

const OUTCOME_STYLE: Record<ForgeOutcome, { emoji: string; textClass: string; borderClass: string }> = {
  success:   { emoji: '\u2728',                    textClass: 'text-[var(--rpg-green-light)]', borderClass: 'border-[var(--rpg-green-light)]' },
  protected: { emoji: '\uD83D\uDEE1\uFE0F',       textClass: 'text-[var(--rpg-blue-light)]',  borderClass: 'border-[var(--rpg-blue-light)]' },
  fail:      { emoji: '\uD83D\uDCA5',              textClass: 'text-[var(--rpg-red)]',         borderClass: 'border-[var(--rpg-red)]' },
};

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
        const style = OUTCOME_STYLE[forgeOutcome(item.data.type)];
        return (
          <div className="flex items-center gap-2">
            <span>{style.emoji}</span>
            <span className={style.textClass}>{item.data.message}</span>
          </div>
        );
      }}
      cardClassName={(item) => {
        const style = OUTCOME_STYLE[forgeOutcome(item.data.type)];
        return `bg-[var(--rpg-surface)] border ${style.borderClass} rounded-lg px-4 py-3 shadow-lg animate-[slideIn_0.3s_ease-out] min-w-[250px] transition-colors`;
      }}
    />
  );
}
