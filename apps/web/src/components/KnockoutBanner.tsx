import { AlertTriangle } from 'lucide-react';

interface KnockoutBannerProps {
  action: string;
  recoveryCost?: number | null;
  title?: string;
  onClick?: () => void;
}

export function KnockoutBanner({ action, recoveryCost, title = 'Knocked Out', onClick }: KnockoutBannerProps) {
  return (
    <div
      className={`bg-[var(--rpg-red)]/20 border border-[var(--rpg-red)] rounded-lg p-4${onClick ? ' cursor-pointer hover:bg-[var(--rpg-red)]/30 transition-colors' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
    >
      <div className="flex items-center gap-3">
        <AlertTriangle size={24} className="text-[var(--rpg-red)] flex-shrink-0" />
        <div className="flex-1">
          <div className="font-bold text-[var(--rpg-red)]">{title}</div>
          <div className="text-sm text-[var(--rpg-text-secondary)]">
            You must recover before {action}.
            {typeof recoveryCost === 'number' && (
              <>
                {' '}
                Cost: <span className="font-pixel text-[16px]">{recoveryCost.toLocaleString()}</span> turns
              </>
            )}
          </div>
        </div>
        {onClick && (
          <span className="text-xs text-[var(--rpg-red)] opacity-70 flex-shrink-0">Tap to recover &rarr;</span>
        )}
      </div>
    </div>
  );
}

