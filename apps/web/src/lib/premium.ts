export interface PremiumPlayerSnapshot {
  isPremium?: boolean;
  premiumExpiresAt?: string | null;
}

export function hasActivePremium(
  player: PremiumPlayerSnapshot | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!player?.isPremium || !player.premiumExpiresAt) {
    return false;
  }

  return new Date(player.premiumExpiresAt).getTime() > now.getTime();
}
