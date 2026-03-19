import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-[var(--rpg-surface-light)]',
        className,
      )}
    />
  );
}

export function SkeletonLine({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-full', className)} />;
}

interface SkeletonCardProps {
  className?: string;
  count?: number;
}

export function SkeletonCard({ className, count = 1 }: SkeletonCardProps) {
  if (count > 1) {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i} className={className} />
        ))}
      </div>
    );
  }
  return (
    <div className={cn('border border-[var(--rpg-border)] rounded-lg p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-5/6" />
    </div>
  );
}
