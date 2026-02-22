import { prisma } from '@adventure/database';
import type { SkillType, SkillXpResult } from '@adventure/shared';
import { applyXpGain, calculateCharacterXpGain, characterLevelFromXp, shouldResetDailyCap } from '@adventure/game-engine';
import { getPlayerGuildModifiers } from './guildUpgradeService';

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
}

export async function grantSkillXp(
  playerId: string,
  skillType: SkillType,
  rawXpGain: number,
  now: Date = new Date()
): Promise<GrantXpResult> {
  // Apply guild XP boost if active
  const guildMods = await getPlayerGuildModifiers(playerId);
  const boostedXpGain = guildMods.xpBoost > 0
    ? Math.floor(rawXpGain * (1 + guildMods.xpBoost))
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

    const needsReset = shouldResetDailyCap(skill.lastXpResetAt, now);
    const currentWindowXpGained = needsReset ? 0 : skill.dailyXpGained;

    const currentXp = Number(skill.xp);
    const xpResult = applyXpGain(
      currentXp,
      skill.level,
      currentWindowXpGained,
      boostedXpGain,
      skillType
    );

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
    };
  });
}

