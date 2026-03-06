'use client';

import { useToastQueue } from '@/hooks/useToastQueue';
import { ToastContainer } from '@/components/common/ToastContainer';

interface AchievementData {
  id: string;
  title: string;
  category: string;
}

interface AchievementToastProps {
  onNavigate?: (category: string) => void;
}

export function AchievementToast({ onNavigate }: AchievementToastProps) {
  const queue = useToastQueue<AchievementData>({
    globalKey: '__showAchievementToast',
    maxVisible: 5,
    makeItem: (raw) => ({ id: raw.id, data: raw }),
  });

  if (queue.isEmpty) return null;

  return (
    <ToastContainer
      position="top-right"
      visible={queue.visible}
      overflow={queue.overflow}
      dismiss={queue.dismiss}
      onClickToast={(item) => {
        queue.dismiss(item.id);
        onNavigate?.(item.data.category);
      }}
      onClickOverflow={() => {
        queue.clearAll();
        onNavigate?.('achievements');
      }}
      overflowLabel={`and ${queue.overflow} more achievement${queue.overflow > 1 ? 's' : ''} unlocked`}
      renderToast={(item) => (
        <div className="flex items-center gap-2">
          <span className="text-lg shrink-0">&#x1F3C6;</span>
          <div className="flex-1">
            <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
              Achievement Unlocked
            </p>
            <p className="text-sm font-medium text-[var(--rpg-gold)]">
              {item.data.title}
            </p>
          </div>
        </div>
      )}
    />
  );
}
