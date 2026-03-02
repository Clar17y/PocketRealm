import { PixelCard } from '@/components/PixelCard';

export function LoadingCard({ message = 'Loading...' }: { message?: string }) {
  return (
    <PixelCard>
      <p className="text-sm opacity-60">{message}</p>
    </PixelCard>
  );
}
