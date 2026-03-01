import { z } from 'zod';
import { prisma } from '@adventure/database';
import type { MobTemplate } from '@adventure/shared';
import { calculateFleeResult } from '@adventure/game-engine';
import { prismaAny } from './prismaAny.js';
import { AppError } from '../middleware/errorHandler.js';
import { getHpState, setHp, enterRecoveringState } from '../services/hpService.js';
import { assertNotOverEncumbered } from '../services/inventoryService.js';
import { incrementStats } from '../services/statsService.js';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService.js';
import { respawnToHomeTown } from '../services/zoneDiscoveryService.js';
import type { GrantXpResult } from '../services/xpService.js';

export const paginationSchema = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
};

export function buildPagination(page: number, pageSize: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

export function serializeXpGrant(grant: GrantXpResult) {
  return {
    skillType: grant.skillType,
    ...grant.xpResult,
    newTotalXp: grant.newTotalXp,
    newDailyXpGained: grant.newDailyXpGained,
    characterXpGain: grant.characterXpGain,
    characterXpAfter: grant.characterXpAfter,
    characterLevelBefore: grant.characterLevelBefore,
    characterLevelAfter: grant.characterLevelAfter,
    attributePointsAfter: grant.attributePointsAfter,
    characterLeveledUp: grant.characterLeveledUp,
  };
}

// ── HP recovery guard ────────────────────────────────────────────────

export async function assertNotRecovering(playerId: string): Promise<Awaited<ReturnType<typeof getHpState>>> {
  const hpState = await getHpState(playerId);
  if (hpState.isRecovering) {
    throw new AppError(400, 'Cannot perform action while recovering', 'IS_RECOVERING');
  }
  return hpState;
}

/** Combined pre-flight guard: not recovering + not over-encumbered. */
export async function assertCanAct(playerId: string): Promise<Awaited<ReturnType<typeof getHpState>>> {
  const hpState = await assertNotRecovering(playerId);
  await assertNotOverEncumbered(playerId);
  return hpState;
}

// ── Bestiary tracking ────────────────────────────────────────────────

export async function recordBestiaryKill(
  playerId: string,
  mobTemplateId: string,
  mobPrefix: string | null,
): Promise<void> {
  await prisma.playerBestiary.upsert({
    where: { playerId_mobTemplateId: { playerId, mobTemplateId } },
    create: { playerId, mobTemplateId, kills: 1 },
    update: { kills: { increment: 1 } },
  });
  if (mobPrefix) {
    await prismaAny.playerBestiaryPrefix.upsert({
      where: { playerId_mobTemplateId_prefix: { playerId, mobTemplateId, prefix: mobPrefix } },
      create: { playerId, mobTemplateId, prefix: mobPrefix, kills: 1 },
      update: { kills: { increment: 1 } },
    });
  }
}

// ── Achievement tracking ─────────────────────────────────────────────

export async function trackAchievements(
  playerId: string,
  counters: Record<string, number>,
  opts?: { statKeys?: string[]; familyIds?: string[] },
): Promise<void> {
  await incrementStats(playerId, counters);
  const statKeys = opts?.statKeys ?? Object.keys(counters);
  const achievements = await checkAchievements(playerId, { statKeys });
  if (opts?.familyIds) {
    for (const familyId of opts.familyIds) {
      achievements.push(...await checkAchievements(playerId, { familyId }));
    }
  }
  if (achievements.length > 0) {
    await emitAchievementNotifications(playerId, achievements);
  }
}

// ── Item ownership validation ────────────────────────────────────────

export interface OwnedItemOptions {
  requireWeaponOrArmor?: boolean;
  requireNotStacked?: boolean;
  requireNotEquipped?: boolean;
}

export async function getOwnedItem(
  playerId: string,
  itemId: string,
  opts: OwnedItemOptions = {},
) {
  const item = await prismaAny.item.findUnique({
    where: { id: itemId },
    include: { template: true },
  });

  if (!item || item.ownerId !== playerId) {
    throw new AppError(404, 'Item not found', 'NOT_FOUND');
  }

  if (opts.requireWeaponOrArmor) {
    if (item.template.itemType !== 'weapon' && item.template.itemType !== 'armor') {
      throw new AppError(400, 'Only weapons/armor can be used for this action', 'INVALID_ITEM_TYPE');
    }
  }

  if (opts.requireNotStacked && item.quantity !== 1) {
    throw new AppError(400, 'Cannot perform this action on stacked items', 'INVALID_STACK');
  }

  if (opts.requireNotEquipped) {
    const equipped = await prisma.playerEquipment.findFirst({
      where: { playerId, itemId: item.id },
    });
    if (equipped) {
      throw new AppError(400, 'Cannot perform this action on an equipped item', 'ITEM_EQUIPPED');
    }
  }

  return item;
}

// ── Mob template coercion ────────────────────────────────────────────

export function toMobTemplate(raw: Record<string, unknown>): MobTemplate {
  return {
    ...raw,
    spellPattern: Array.isArray(raw.spellPattern)
      ? (raw.spellPattern as MobTemplate['spellPattern'])
      : [],
  } as MobTemplate;
}

// ── Combat defeat handling ───────────────────────────────────────────

export interface CombatDefeatParams {
  evasionLevel: number;
  mobLevel: number;
  maxHp: number;
}

export interface CombatDefeatResult {
  fleeResult: ReturnType<typeof calculateFleeResult>;
  respawnedTo: { townId: string; townName: string } | null;
}

export async function handleCombatDefeat(
  playerId: string,
  params: CombatDefeatParams,
): Promise<CombatDefeatResult> {
  const fleeResult = calculateFleeResult({
    evasionLevel: params.evasionLevel,
    mobLevel: params.mobLevel,
    maxHp: params.maxHp,
    currentGold: 0,
  });

  let respawnedTo: { townId: string; townName: string } | null = null;

  if (fleeResult.outcome === 'knockout') {
    await enterRecoveringState(playerId, params.maxHp);
    respawnedTo = await respawnToHomeTown(playerId);
    await trackAchievements(playerId, { totalDeaths: 1 });
  } else {
    await setHp(playerId, fleeResult.remainingHp);
  }

  return { fleeResult, respawnedTo };
}
