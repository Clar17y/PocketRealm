import type { Prisma } from '@pocketrealm/database';

export interface PremiumEntitlementSnapshot {
  isPremium: boolean;
  premiumExpiresAt: Date | null;
}

interface PremiumEntitlementClient {
  player: {
    findUnique: Prisma.TransactionClient['player']['findUnique'];
  };
}

export function hasActivePremiumEntitlement(
  player: PremiumEntitlementSnapshot | null | undefined,
  now: Date = new Date(),
): boolean {
  return !!player?.isPremium
    && player.premiumExpiresAt instanceof Date
    && player.premiumExpiresAt.getTime() > now.getTime();
}

export async function getHasActivePremiumEntitlement(
  client: PremiumEntitlementClient,
  playerId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const player = await client.player.findUnique({
    where: { id: playerId },
    select: {
      account: {
        select: {
          isPremium: true,
          premiumExpiresAt: true,
        },
      },
    },
  });

  return hasActivePremiumEntitlement(player?.account, now);
}
