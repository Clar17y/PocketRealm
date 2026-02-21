import { z } from 'zod';
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
