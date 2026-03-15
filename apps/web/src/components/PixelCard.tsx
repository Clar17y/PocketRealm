import { cn } from '@/lib/utils';

interface PixelCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'framed' | 'ornate';
  onClick?: (e: React.MouseEvent) => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export function PixelCard({ children, className, padding = 'md', variant = 'default', onClick, role, tabIndex, onKeyDown }: PixelCardProps) {
  const paddingClasses = {
    none: 'p-0',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6',
  };

  const variantClasses = {
    default: 'rpg-card-texture',
    framed: 'rpg-card-texture rpg-gold-frame',
    ornate: 'rpg-card-texture rpg-gold-frame',
  };

  return (
    <div
      className={cn(
        'bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded-lg relative',
        variantClasses[variant],
        paddingClasses[padding],
        className
      )}
      onClick={onClick}
      role={role}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
    >
      {variant === 'ornate' && (
        <>
          <div className="absolute top-1 left-1 w-4 h-4 border-t-2 border-l-2 border-[var(--rpg-gold)] opacity-20 pointer-events-none z-10" />
          <div className="absolute bottom-1 right-1 w-4 h-4 border-b-2 border-r-2 border-[var(--rpg-gold)] opacity-20 pointer-events-none z-10" />
        </>
      )}
      {children}
    </div>
  );
}
