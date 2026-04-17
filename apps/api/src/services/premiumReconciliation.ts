import { prisma } from '@pocketrealm/database';

export interface PremiumReconciliationResult {
  updatedCount: number;
}

export async function reconcileExpiredPremium(now: Date = new Date()): Promise<PremiumReconciliationResult> {
  const result = await prisma.player.updateMany({
    where: {
      isPremium: true,
      premiumExpiresAt: {
        lte: now,
      },
    },
    data: {
      isPremium: false,
    },
  });

  return {
    updatedCount: result.count,
  };
}
