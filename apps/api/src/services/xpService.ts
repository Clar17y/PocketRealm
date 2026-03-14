import { prisma } from '@pocketrealm/database';
import type { SkillType, SkillXpResult } from '@pocketrealm/shared';
import { SKILL_CONSTANTS, SKILL_POINT_CONSTANTS } from '@pocketrealm/shared';
import { applyXpGain, calculateCharacterXpGain, characterLevelFromXp, levelFromXp, shouldResetWindowCap } from '@pocketrealm/game-engine';
import { getPlayerGuildModifiers } from './guildUpgradeService';
import { consumeBuffIfActive } from './buffService';

export interface GrantXpResult {
  skillType: SkillType;
  xpResult: SkillXpResult;
  /** XP after efficiency with boost applied (what the player actually receives) */
  boostedXpAfterEfficiency: number;
  newTotalXp: number;
  newDailyXpGained: number;
  newLevel: number;
  skillLeveledUp: boolean;
  characterXpGain: number;
  characterXpAfter: number;
  characterLevelBefore: number;
  characterLevelAfter: number;
  attributePointsAfter: number;
  characterLeveledUp: boolean;
  skillPointsGained: number;
}

export async function grantSkillXp(
  playerId: string,
  skillType: SkillType,
  rawXpGain: number,
  now: Date = new Date(),
  guildXpBoost?: number,
): Promise<GrantXpResult> {
  // Guild XP boost can be fetched outside the transaction (not consumed, no race)
  const xpBoost = guildXpBoost ?? (await getPlayerGuildModifiers(playerId)).xpBoost;

  return prisma.$transaction(async (tx) => {
    // Lock the player row to serialize concurrent XP grants for the same player.
    // Without this, two concurrent transactions could both read the same characterLevel,
    // both compute a level-up, and both increment attributePoints — doubling the reward.
    await tx.$queryRaw`SELECT id FROM "players" WHERE id = ${playerId} FOR UPDATE`;

    const txAny = tx as unknown as any;

    // Atomically read + consume shop XP buff inside the transaction to prevent
    // concurrent actions from double-applying a single-use buff
    const shopXpBoost = await consumeBuffIfActive(txAny, playerId, 'xp_boost');

    const totalXpBoost = Math.min(xpBoost + shopXpBoost, SKILL_CONSTANTS.MAX_XP_BOOST);
    const boostedXpGain = totalXpBoost > 0
      ? Math.floor(rawXpGain * (1 + totalXpBoost))
      : rawXpGain;

    const [skill, player] = await Promise.all([
      tx.playerSkill.findUnique({
        where: {
          playerId_skillType: { playerId, skillType },
        },
      }),
      txAny.player.findUnique({
        where: { id: playerId },
        select: {
          characterXp: true,
          characterLevel: true,
          attributePoints: true,
        },
      }),
    ]);

    if (!skill) {
      throw new Error(`Skill not found for playerId=${playerId}, skillType=${skillType}`);
    }
    if (!player) {
      throw new Error(`Player not found for playerId=${playerId}`);
    }

    const needsReset = shouldResetWindowCap(skill.lastXpResetAt, now);
    const currentWindowXpGained = needsReset ? 0 : skill.dailyXpGained;

    const currentXp = Number(skill.xp);
    const xpResult = applyXpGain(
      currentXp,
      skill.level,
      currentWindowXpGained,
      rawXpGain,
      skillType
    );

    // Apply boost AFTER efficiency so boosts give a genuine percentage increase
    const boostedXpAfterEfficiency = totalXpBoost > 0
      ? Math.floor(xpResult.xpAfterEfficiency * (1 + totalXpBoost))
      : xpResult.xpAfterEfficiency;

    const newTotalXp = currentXp + boostedXpAfterEfficiency;
    // Recalculate level from boosted total so boosts can trigger level-ups
    const newLevel = levelFromXp(newTotalXp);
    const skillLeveledUp = newLevel > skill.level;
    const skillPointsGained = skillLeveledUp
      ? (newLevel - skill.level) * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL
      : 0;

    // Use unboosted value for window cap so boosts don't accelerate hitting the wall
    const newDailyXpGained = currentWindowXpGained + xpResult.xpAfterEfficiency;

    await tx.playerSkill.update({
      where: {
        playerId_skillType: { playerId, skillType },
      },
      data: {
        xp: BigInt(newTotalXp),
        level: newLevel,
        dailyXpGained: newDailyXpGained,
        ...(needsReset ? { lastXpResetAt: now } : {}),
      },
    });

    const characterXpGain = calculateCharacterXpGain(boostedXpAfterEfficiency);
    const characterXpBefore = Number(player.characterXp);
    const characterXpAfter = characterXpBefore + characterXpGain;
    const characterLevelBefore = player.characterLevel;
    const characterLevelAfter = characterLevelFromXp(characterXpAfter);
    const levelUps = Math.max(0, characterLevelAfter - characterLevelBefore);
    const attributePointsAfter = player.attributePoints + levelUps;

    await txAny.player.update({
      where: { id: playerId },
      data: {
        // Use atomic increment to prevent concurrent XP grants from racing on characterXp
        characterXp: { increment: BigInt(characterXpGain) },
        characterLevel: characterLevelAfter,
        // Use atomic increment to prevent concurrent XP grants from overwriting each other's attribute points
        attributePoints: levelUps > 0 ? { increment: levelUps } : undefined,
      },
    });

    return {
      skillType,
      xpResult,
      boostedXpAfterEfficiency,
      newTotalXp,
      newDailyXpGained,
      newLevel,
      skillLeveledUp,
      characterXpGain,
      characterXpAfter,
      characterLevelBefore,
      characterLevelAfter,
      attributePointsAfter,
      characterLeveledUp: characterLevelAfter > characterLevelBefore,
      skillPointsGained,
    };
  });
}

