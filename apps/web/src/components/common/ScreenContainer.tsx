import { cn } from '@/lib/utils';

interface ScreenContainerProps {
  children: React.ReactNode;
  spacing?: 'y-3' | 'y-4';
  className?: string;
  /** Reserve bottom padding so content clears a DockedActionBar. */
  bottomInset?: boolean;
}

export function ScreenContainer({ children, spacing = 'y-4', className, bottomInset = false }: ScreenContainerProps) {
  return (
    <div className={cn(`rpg-screen-enter space-${spacing}`, bottomInset && 'pb-[7.5rem]', className)}>
      {children}
    </div>
  );
}
