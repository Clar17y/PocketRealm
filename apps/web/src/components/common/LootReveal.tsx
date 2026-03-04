import Image from 'next/image';
import { RARITY_COLORS, RARITY_GLOW } from '@/lib/rarity';
import { getStaggerDelay } from '@/lib/animations';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';

export interface LootRevealItem {
  name: string;
  rarity: 'uncommon' | 'rare' | 'epic' | 'legendary';
  quantity: number;
  imageSrc?: string;
}

interface LootRevealProps {
  items: LootRevealItem[];
  onContinue: () => void;
}

const TITLE_BY_RARITY: Record<LootRevealItem['rarity'], string> = {
  uncommon: 'Uncommon Loot!',
  rare: 'Rare Find!',
  epic: 'Epic Discovery!',
  legendary: 'Legendary Drop!',
};

const RARITY_RANK: Record<string, number> = { uncommon: 1, rare: 2, epic: 3, legendary: 4 };

function highestRarity(items: LootRevealItem[]): LootRevealItem['rarity'] {
  let best: LootRevealItem['rarity'] = 'uncommon';
  for (const item of items) {
    if ((RARITY_RANK[item.rarity] ?? 0) > (RARITY_RANK[best] ?? 0)) {
      best = item.rarity;
    }
  }
  return best;
}

export function LootReveal({ items, onContinue }: LootRevealProps) {
  const best = highestRarity(items);
  const gridCols = items.length <= 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="bg-black/70 fixed inset-0 z-50 flex items-center justify-center">
      <PixelCard variant="ornate" className="rpg-screen-enter max-w-sm w-full mx-4">
        <h2
          className="font-display text-center text-lg mb-4"
          style={{ color: RARITY_COLORS[best] }}
        >
          {TITLE_BY_RARITY[best]}
        </h2>

        <div className={`grid ${gridCols} gap-3 mb-4`}>
          {items.map((item, i) => (
            <div
              key={`${item.name}-${i}`}
              className={`rpg-loot-reveal relative flex flex-col items-center rounded-lg p-2 bg-black/30 border ${RARITY_GLOW[item.rarity]} ${item.rarity === 'legendary' ? 'rpg-legendary-flash' : ''}`}
              style={{
                borderColor: RARITY_COLORS[item.rarity],
                animationDelay: getStaggerDelay(i),
              }}
            >
              {item.imageSrc ? (
                <Image
                  src={item.imageSrc}
                  alt={item.name}
                  width={48}
                  height={48}
                  className="[image-rendering:pixelated] mb-1"
                  unoptimized
                />
              ) : (
                <div
                  className="w-12 h-12 flex items-center justify-center mb-1 text-center font-display text-[8px] leading-tight"
                  style={{ color: RARITY_COLORS[item.rarity] }}
                >
                  {item.name}
                </div>
              )}
              <span className="font-display text-[8px] text-center leading-tight text-[var(--rpg-text-primary)]">
                {item.name}
              </span>
              {item.quantity > 1 && (
                <span
                  className="absolute top-1 right-1 text-[8px] font-bold rounded-full bg-black/60 px-1"
                  style={{ color: RARITY_COLORS[item.rarity] }}
                >
                  x{item.quantity}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <PixelButton variant="primary" size="sm" onClick={onContinue}>
            Continue
          </PixelButton>
        </div>
      </PixelCard>
    </div>
  );
}
