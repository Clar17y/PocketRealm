interface DividerProps {
  className?: string;
}

export function Divider({ className }: DividerProps) {
  return (
    <div className={`flex items-center gap-3 ${className ?? ''}`}>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--rpg-gold)]/30 to-transparent" />
      <div className="w-1.5 h-1.5 rotate-45 bg-[var(--rpg-gold)]/40" />
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-[var(--rpg-gold)]/30 to-transparent" />
    </div>
  );
}
