import { cn } from '@/lib/utils';

interface ScreenContainerProps {
  children: React.ReactNode;
  spacing?: 'y-3' | 'y-4';
  className?: string;
}

export function ScreenContainer({ children, spacing = 'y-4', className }: ScreenContainerProps) {
  return (
    <div className={cn(`rpg-screen-enter space-${spacing}`, className)}>
      {children}
    </div>
  );
}
