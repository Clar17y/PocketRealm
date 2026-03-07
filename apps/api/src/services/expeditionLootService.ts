import { prisma } from '@pocketrealm/database';
import { EXPEDITION_CONSTANTS, type ExpeditionRoomType } from '@pocketrealm/shared';
import { rollAndGrantLoot, enrichLootWithNames } from './lootService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpeditionContributor {
  playerId: string;
  roomDamage: number;
  roomHealing: number;
}

export interface ExpeditionLootDrop {
  itemTemplateId: string;
  quantity: number;
  rarity?: string;
  itemName?: string;
}

// ---------------------------------------------------------------------------
// Room Loot Distribution
// ---------------------------------------------------------------------------

/**
 * Distribute loot from a cleared expedition room, weighted by contribution.
 * Follows the same contribution-ratio pattern as bossLootService.
 */
export async function distributeRoomLoot(
  contributors: ExpeditionContributor[],
  roomType: ExpeditionRoomType,
  tier: number,
  mobTemplateIds: string[],
): Promise<Record<string, { loot: ExpeditionLootDrop[] }>> {
  const result: Record<string, { loot: ExpeditionLootDrop[] }> = {};
  if (contributors.length === 0 || mobTemplateIds.length === 0) return result;

  // Calculate contribution scores (simple sum, matching boss pattern)
  const scores = contributors.map((c) => ({
    playerId: c.playerId,
    score: c.roomDamage + c.roomHealing,
  }));
  const totalContribution = scores.reduce((sum, s) => sum + s.score, 0);

  const lootMultiplier = EXPEDITION_CONSTANTS.LOOT_MULTIPLIER[roomType];
  const mobLevel = tier * 5; // approximate mob level from tier

  for (const contributor of contributors) {
    const playerScore = scores.find((s) => s.playerId === contributor.playerId)?.score ?? 0;
    const ratio =
      totalContribution > 0
        ? playerScore / totalContribution
        : 1 / contributors.length;

    // Scale drop chance by contribution ratio and room type multiplier
    // Clamp between 0.5 and 2.0 (same as boss loot)
    const dropMultiplier = Math.max(
      0.5,
      Math.min(2, ratio * contributors.length * lootMultiplier),
    );

    // Roll loot from each mob's drop table
    const allLoot: ExpeditionLootDrop[] = [];
    for (const mobTemplateId of mobTemplateIds) {
      const drops = await rollAndGrantLoot(
        contributor.playerId,
        mobTemplateId,
        mobLevel,
        dropMultiplier,
      );
      const enriched = await enrichLootWithNames(drops);
      for (const drop of enriched) {
        allLoot.push({
          itemTemplateId: drop.itemTemplateId,
          quantity: drop.quantity,
          rarity: drop.rarity,
          itemName: drop.itemName ?? undefined,
        });
      }
    }

    result[contributor.playerId] = { loot: allLoot };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Room Token Awards
// ---------------------------------------------------------------------------

/**
 * Award expedition tokens to all members for clearing a room.
 * Returns the token amount per player.
 */
export async function awardRoomTokens(
  members: { playerId: string }[],
  roomType: ExpeditionRoomType,
  tier: number,
): Promise<number> {
  const baseTokens = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[roomType];
  const tierMultiplier = EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[tier - 1] ?? 1;
  const tokens = baseTokens * tierMultiplier;

  await Promise.all(
    members.map((m) =>
      prisma.player.update({
        where: { id: m.playerId },
        data: { expeditionTokens: { increment: tokens } },
      }),
    ),
  );

  return tokens;
}

// ---------------------------------------------------------------------------
// Completion Bonus
// ---------------------------------------------------------------------------

/**
 * Award a completion bonus in tokens based on cumulative room value.
 * Returns the bonus token amount per player.
 */
export async function awardCompletionBonus(
  members: { playerId: string }[],
  tier: number,
  totalRooms: number,
  roomTypes: ExpeditionRoomType[],
): Promise<number> {
  // Sum the token value of every room
  let totalRoomTokens = 0;
  for (const rt of roomTypes) {
    const baseTokens = EXPEDITION_CONSTANTS.TOKENS_PER_ROOM[rt];
    const tierMultiplier = EXPEDITION_CONSTANTS.TOKEN_TIER_MULTIPLIER[tier - 1] ?? 1;
    totalRoomTokens += baseTokens * tierMultiplier;
  }

  const bonusTokens = Math.floor(
    totalRoomTokens * EXPEDITION_CONSTANTS.COMPLETION_BONUS_MULTIPLIER,
  );

  if (bonusTokens <= 0) return 0;

  await Promise.all(
    members.map((m) =>
      prisma.player.update({
        where: { id: m.playerId },
        data: { expeditionTokens: { increment: bonusTokens } },
      }),
    ),
  );

  return bonusTokens;
}
