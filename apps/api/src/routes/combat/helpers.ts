import { z } from 'zod';
import { Prisma, prisma } from '@adventure/database';
import { EXPLORATION_CONSTANTS } from '@adventure/shared';
import type { PotionConsumed } from '@adventure/shared';
import { degradeEquippedDurability } from '../../services/durabilityService';
import { grantSkillXp } from '../../services/xpService';
import type { LootDropWithName } from '../../services/lootService';

export const prismaAny = prisma as unknown as any;

export const attackSkillSchema = z.enum(['melee', 'ranged', 'magic']);

export type EncounterSiteSize = 'small' | 'medium' | 'large';

export const lootDropWithNameSchema = z.object({
  itemTemplateId: z.string().min(1),
  quantity: z.number().int().min(1),
  rarity: z.enum(['common', 'uncommon', 'rare', 'epic', 'legendary']).optional(),
  itemName: z.string().nullable().optional(),
});

export const startSchema = z.object({
  encounterSiteId: z.string().uuid().optional(),
  zoneId: z.string().uuid().optional(),
  mobTemplateId: z.string().uuid().optional(),
  attackSkill: attackSkillSchema.optional(),
}).refine((v) => Boolean(v.encounterSiteId || v.zoneId), {
  message: 'encounterSiteId or zoneId is required',
});

export const listEncounterSitesQuerySchema = z.object({
  zoneId: z.string().uuid().optional(),
  mobFamilyId: z.string().uuid().optional(),
  sort: z.enum(['recent', 'danger']).default('danger'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export function pickWeighted<T extends { encounterWeight: number }>(items: T[]): T | null {
  const totalWeight = items.reduce((sum, item) => sum + item.encounterWeight, 0);
  if (totalWeight <= 0) return null;

  let roll = Math.random() * totalWeight;
  for (const item of items) {
    roll -= item.encounterWeight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

export function toEncounterSiteSize(value: string): EncounterSiteSize {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return 'small';
}

export type EncounterMobRole = 'trash' | 'elite' | 'boss';
export type EncounterMobStatus = 'alive' | 'defeated' | 'decayed';

export interface EncounterMobState {
  slot: number;
  mobTemplateId: string;
  role: EncounterMobRole;
  prefix: string | null;
  status: EncounterMobStatus;
  room: number;
}

export function parseEncounterSiteMobs(raw: unknown): EncounterMobState[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const value = (raw as { mobs?: unknown }).mobs;
  if (!Array.isArray(value)) return [];

  const parsed: EncounterMobState[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const slot = typeof row.slot === 'number' ? Math.floor(row.slot) : null;
    const mobTemplateId = typeof row.mobTemplateId === 'string' ? row.mobTemplateId : null;
    const role = row.role === 'trash' || row.role === 'elite' || row.role === 'boss' ? row.role : null;
    const status = row.status === 'alive' || row.status === 'defeated' || row.status === 'decayed' ? row.status : null;
    const prefix = typeof row.prefix === 'string' ? row.prefix : null;
    const room = typeof row.room === 'number' ? Math.floor(row.room) : 1;
    if (slot === null || !mobTemplateId || !role || !status) continue;

    parsed.push({
      slot,
      mobTemplateId,
      role,
      prefix,
      status,
      room,
    });
  }

  return parsed.sort((a, b) => a.slot - b.slot);
}

export function serializeEncounterSiteMobs(mobs: EncounterMobState[]): Prisma.InputJsonObject {
  return { mobs } as unknown as Prisma.InputJsonObject;
}

export function countEncounterSiteState(mobs: EncounterMobState[]): {
  total: number;
  alive: number;
  defeated: number;
  decayed: number;
} {
  let alive = 0;
  let defeated = 0;
  let decayed = 0;
  for (const mob of mobs) {
    if (mob.status === 'alive') alive++;
    if (mob.status === 'defeated') defeated++;
    if (mob.status === 'decayed') decayed++;
  }
  return { total: mobs.length, alive, defeated, decayed };
}

export function roleOrder(role: EncounterMobRole): number {
  if (role === 'trash') return 0;
  if (role === 'elite') return 1;
  return 2;
}

export function getNextEncounterMob(mobs: EncounterMobState[]): EncounterMobState | null {
  const alive = mobs.filter((mob) => mob.status === 'alive');
  if (alive.length === 0) return null;
  alive.sort((a, b) => {
    const roleDiff = roleOrder(a.role) - roleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.slot - b.slot;
  });
  return alive[0] ?? null;
}

export function getNextEncounterMobInRoom(mobs: EncounterMobState[], roomNumber: number): EncounterMobState | null {
  const alive = mobs.filter((mob) => mob.status === 'alive' && mob.room === roomNumber);
  if (alive.length === 0) return null;
  alive.sort((a, b) => {
    const roleDiff = roleOrder(a.role) - roleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.slot - b.slot;
  });
  return alive[0] ?? null;
}

export function getAllAliveMobsInRoom(mobs: EncounterMobState[], roomNumber: number): EncounterMobState[] {
  return mobs
    .filter((mob) => mob.status === 'alive' && mob.room === roomNumber)
    .sort((a, b) => {
      const roleDiff = roleOrder(a.role) - roleOrder(b.role);
      if (roleDiff !== 0) return roleDiff;
      return a.slot - b.slot;
    });
}

export function getRoomState(mobs: EncounterMobState[], roomNumber: number): {
  total: number;
  alive: number;
  defeated: number;
} {
  const roomMobs = mobs.filter(m => m.room === roomNumber);
  let alive = 0, defeated = 0;
  for (const m of roomMobs) {
    if (m.status === 'alive') alive++;
    if (m.status === 'defeated') defeated++;
  }
  return { total: roomMobs.length, alive, defeated };
}

export function getMaxRoom(mobs: EncounterMobState[]): number {
  return Math.max(...mobs.map(m => m.room), 1);
}

export function getNextUnfinishedRoom(mobs: EncounterMobState[], startRoom: number): number | null {
  const maxRoom = getMaxRoom(mobs);
  for (let r = startRoom; r <= maxRoom; r++) {
    const state = getRoomState(mobs, r);
    if (state.alive > 0) return r;
  }
  return null;
}

export function applyEncounterSiteDecayInMemory(mobs: EncounterMobState[], discoveredAt: Date, now: Date): {
  mobs: EncounterMobState[];
  changed: boolean;
} {
  const elapsedMs = Math.max(0, now.getTime() - discoveredAt.getTime());
  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const decayTarget = Math.max(0, Math.floor(elapsedHours * EXPLORATION_CONSTANTS.ENCOUNTER_SITE_DECAY_RATE_PER_HOUR));
  const currentDecayed = mobs.filter((mob) => mob.status === 'decayed').length;
  const toDecay = Math.max(0, decayTarget - currentDecayed);
  if (toDecay <= 0) return { mobs, changed: false };

  const next = mobs.map((mob) => ({ ...mob }));
  let decayed = 0;
  for (const mob of next) {
    if (mob.status !== 'alive') continue;
    mob.status = 'decayed';
    decayed++;
    if (decayed >= toDecay) break;
  }

  return { mobs: next, changed: decayed > 0 };
}

export async function applyEncounterSiteDecayAndPersist(
  site: {
    id: string;
    playerId: string;
    discoveredAt: Date;
    mobs: unknown;
  },
  now: Date
): Promise<{
  mobs: EncounterMobState[];
  state: { total: number; alive: number; defeated: number; decayed: number };
  nextMob: EncounterMobState | null;
} | null> {
  const parsed = parseEncounterSiteMobs(site.mobs);
  if (parsed.length === 0) {
    await prismaAny.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
    return null;
  }

  const decayed = applyEncounterSiteDecayInMemory(parsed, site.discoveredAt, now);
  if (decayed.changed) {
    const postDecay = countEncounterSiteState(decayed.mobs);
    if (postDecay.alive <= 0) {
      await prismaAny.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
      return null;
    }

    await prismaAny.encounterSite.update({
      where: { id: site.id },
      data: { mobs: serializeEncounterSiteMobs(decayed.mobs) },
    });
  }

  const state = countEncounterSiteState(decayed.mobs);
  if (state.alive <= 0) {
    await prismaAny.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
    return null;
  }

  return {
    mobs: decayed.mobs,
    state,
    nextMob: getNextEncounterMob(decayed.mobs),
  };
}

export interface FightResult {
  mobName: string;
  mobDisplayName: string;
  mobTemplateId: string;
  mobPrefix: string | null;
  outcome: string;
  playerMaxHp: number;
  playerStartHp: number;
  mobMaxHp: number;
  log: unknown[];
  playerHpRemaining: number;
  potionsConsumed: PotionConsumed[];
  xp: number;
  loot: LootDropWithName[];
  durabilityLost: Awaited<ReturnType<typeof degradeEquippedDurability>>;
  skillXp: Awaited<ReturnType<typeof grantSkillXp>> | null;
}
