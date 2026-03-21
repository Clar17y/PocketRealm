'use client';

import { PixelButton } from '@/components/PixelButton';

export interface CombatAction {
  key: string;
  label: string;
  subtext?: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'secondary';
  visible?: boolean;
}

export interface CombatActionButtonsProps {
  actions: CombatAction[];
  loading?: boolean;
}

export function CombatActionButtons({ actions, loading }: CombatActionButtonsProps) {
  const visibleActions = actions.filter(a => a.visible !== false);
  if (visibleActions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visibleActions.map(action => (
        <div key={action.key}>
          <PixelButton
            size="sm"
            onClick={action.onClick}
            disabled={action.disabled || loading}
            variant={action.variant ?? 'primary'}
          >
            {loading && !action.disabled ? `${action.label}...` : action.label}
          </PixelButton>
          {action.subtext && (
            <p className="text-[10px] text-[var(--rpg-text-secondary)] mt-1">
              {action.subtext}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
