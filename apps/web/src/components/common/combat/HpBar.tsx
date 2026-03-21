'use client';

export function HpBar({ current, max, label, color }: { current: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
  return (
    <div className="relative w-full h-4 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 transition-all duration-300"
        style={{ width: `${pct}%`, backgroundColor: color }}
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={max}
      />
      <div className="absolute inset-0 flex items-center px-1.5">
        <span className="text-[8px] font-pixel text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
          {label} {Math.floor(current)}/{max}
        </span>
      </div>
    </div>
  );
}
