import { cn } from '@/lib/utils';
import Image from 'next/image';
import { RARITY_COLORS, RARITY_GLOW, type Rarity } from '@/lib/rarity';

interface ItemCardProps {
  name: string;
  icon?: string;
  imageSrc?: string;
  quantity?: number;
  rarity?: Rarity;
  durability?: { current: number; max: number } | null;
  onClick?: () => void;
}

export function ItemCard({ name, icon, imageSrc, quantity, rarity = 'common', durability, onClick }: ItemCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative w-full aspect-square bg-[var(--rpg-surface)] rounded-lg border-2 transition-all hover:scale-105 active:scale-95',
        RARITY_GLOW[rarity]
      )}
      style={{ borderColor: RARITY_COLORS[rarity] }}
      title={name}
    >
      <div className="w-full h-full flex items-center justify-center p-2">
        {imageSrc ? (
          <div className="relative w-full h-full">
            <Image src={imageSrc} alt={name} fill sizes="96px" className="object-contain image-rendering-pixelated" />
          </div>
        ) : (
          <span className="text-4xl">{icon ?? '❓'}</span>
        )}
      </div>
      {quantity !== undefined && quantity > 1 && (
        <div className="absolute bottom-1 right-1 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded px-1.5 py-0.5 text-xs font-mono text-[var(--rpg-text-primary)]">
          {quantity}
        </div>
      )}
      {durability && durability.max > 0 && durability.current < durability.max && (
        <div className="absolute bottom-0 left-1 right-1">
          <div className="h-1 bg-[var(--rpg-background)] rounded-full overflow-hidden border border-[var(--rpg-border)]">
            <div
              className={`h-full ${
                durability.current <= 0
                  ? 'bg-[var(--rpg-red)]'
                  : (durability.current / durability.max) < 0.10
                    ? 'bg-[var(--rpg-gold)]'
                    : 'bg-[var(--rpg-text-secondary)]'
              }`}
              style={{
                width: `${durability.current <= 0 ? 100 : (durability.current / durability.max) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
    </button>
  );
}
