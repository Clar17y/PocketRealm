import { prisma } from '@pocketrealm/database';
import type { SkillType, SkillXpResult } from '@pocketrealm/shared';
import { SKILL_POINT_CONSTANTS } from '@pocketrealm/shared';
import { applyXpGain, calculateCharacterXpGain, characterLevelFromXp, shouldResetWindowCap } from '@pocketrealm/game-engine';
import { getPlayerGuildModifiers } from './guildUpgradeService';
import { getBuffValue, consumeBuff } from './buffService';

export interface GrantXpResult {
  skillType: SkillType;
  xpResult: SkillXpResult;
  newTotalXp: number;
  newDailyXpGained: number;
  newLevel: number;
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
  // Apply guild XP boost if active (use pre-resolved value if provided)
  const xpBoost = guildXpBoost ?? (await getPlayerGuildModifiers(playerId)).xpBoost;
  const shopXpBoost = await getBuffValue(playerId, 'xp_boost');
  const totalXpBoost = xpBoost + shopXpBoost;
  const boostedXpGain = totalXpBoost > 0
    ? Math.floor(rawXpGain * (1 + totalXpBoost))
    : rawXpGain;

  return prisma.$transaction(async (tx) => {
    const txAny = tx as unknown as any;
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
      boostedXpGain,
      skillType
    );

    const skillLeveledUp = xpResult.newLevel > skill.level;
    const skillPointsGained = skillLeveledUp
      ? (xpResult.newLevel - skill.level) * SKILL_POINT_CONSTANTS.POINTS_PER_LEVEL
      : 0;

    const newTotalXp = currentXp + xpResult.xpAfterEfficiency;
    const newDailyXpGained = currentWindowXpGained + xpResult.xpAfterEfficiency;

    await tx.playerSkill.update({
      where: {
        playerId_skillType: { playerId, skillType },
      },
      data: {
        xp: BigInt(newTotalXp),
        level: xpResult.newLevel,
        dailyXpGained: newDailyXpGained,
        ...(needsReset ? { lastXpResetAt: now } : {}),
      },
    });

    const characterXpGain = calculateCharacterXpGain(xpResult.xpAfterEfficiency);
    const characterXpBefore = Number(player.characterXp);
    const characterXpAfter = characterXpBefore + characterXpGain;
    const characterLevelBefore = player.characterLevel;
    const characterLevelAfter = characterLevelFromXp(characterXpAfter);
    const levelUps = Math.max(0, characterLevelAfter - characterLevelBefore);
    const attributePointsAfter = player.attributePoints + levelUps;

    await txAny.player.update({
      where: { id: playerId },
      data: {
        characterXp: BigInt(characterXpAfter),
        characterLevel: characterLevelAfter,
        attributePoints: attributePointsAfter,
      },
    });

    if (shopXpBoost > 0) {
      await consumeBuff(tx, playerId, 'xp_boost');
    }

    return {
      skillType,
      xpResult,
      newTotalXp,
      newDailyXpGained,
      newLevel: xpResult.newLevel,
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

