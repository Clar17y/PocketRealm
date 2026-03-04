import { cn } from '@/lib/utils';

export const pixelButtonVariants = {
  primary: 'bg-[var(--rpg-green-dark)] hover:bg-[var(--rpg-green-light)] text-[var(--rpg-text-primary)]',
  secondary: 'border-2 border-[var(--rpg-border)] hover:border-[var(--rpg-text-secondary)] text-[var(--rpg-text-primary)] bg-transparent',
  danger: 'bg-[var(--rpg-red)] hover:bg-[#cc4444] text-[var(--rpg-text-primary)]',
  gold: 'bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)]',
} as const;

export const pixelButtonSizes = {
  sm: 'px-3 py-1.5 text-sm min-h-[36px]',
  md: 'px-4 py-2 text-base min-h-[48px]',
  lg: 'px-6 py-3 text-lg min-h-[56px]',
} as const;

export const pixelButtonBase = 'rounded-lg font-body font-semibold transition-all active:scale-95';

interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'gold';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

export function PixelButton({
  variant = 'primary',
  size = 'md',
  children,
  className,
  ...props
}: PixelButtonProps) {
  return (
    <button
      className={cn(pixelButtonBase, 'disabled:opacity-50 disabled:cursor-not-allowed', pixelButtonVariants[variant], pixelButtonSizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}
