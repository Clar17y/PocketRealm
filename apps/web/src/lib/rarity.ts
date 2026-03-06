export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export function rarityFromTier(tier: number): Rarity {
  if (tier >= 5) return 'legendary';
  if (tier === 4) return 'epic';
  if (tier === 3) return 'rare';
  if (tier === 2) return 'uncommon';
  return 'common';
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#5a5a6a',
  uncommon: '#6aaa5a',
  rare: '#5aaad4',
  epic: '#7a4a9a',
  legendary: '#d4a84b',
};

export const RARITY_RANK: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

export type ConfirmRarity = Rarity | 'none';

export function rarityMeetsThreshold(itemRarity: string, threshold: string): boolean {
  if (threshold === 'none') return false;
  return (RARITY_RANK[itemRarity] ?? 0) >= (RARITY_RANK[threshold] ?? 0);
}

export const RARITY_GLOW: Record<Rarity, string> = {
  common: 'shadow-none',
  uncommon: 'shadow-[0_0_8px_rgba(106,170,90,0.3)]',
  rare: 'shadow-[0_0_8px_rgba(90,170,212,0.3)]',
  epic: 'shadow-[0_0_8px_rgba(122,74,154,0.3)]',
  legendary: 'shadow-[0_0_12px_rgba(212,168,75,0.4)]',
};

