import { z } from 'zod';
import { Prisma, prisma } from '@pocketrealm/database';
import { EXPLORATION_CONSTANTS } from '@pocketrealm/shared';
import type { PotionConsumed, EncounterSiteSize, EncounterMobRole, EncounterMobStatus, EncounterMobSlot } from '@pocketrealm/shared';
import { degradeEquippedDurability } from '../../services/durabilityService';
import { grantSkillXp } from '../../services/xpService';
import type { LootDropWithName } from '../../services/lootService';
import { paginationSchema } from '../../utils/routeHelpers.js';

const attackSkillSchema = z.enum(['melee', 'ranged', 'magic']);

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
  ...paginationSchema,
});

export { pickWeighted } from '../../utils/pickWeighted.js';

export function toEncounterSiteSize(value: string): EncounterSiteSize {
  if (value === 'small' || value === 'medium' || value === 'large') return value;
  return 'small';
}

export function parseEncounterSiteMobs(raw: unknown): EncounterMobSlot[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const value = (raw as { mobs?: unknown }).mobs;
  if (!Array.isArray(value)) return [];

  const parsed: EncounterMobSlot[] = [];
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

export function serializeEncounterSiteMobs(mobs: EncounterMobSlot[]): Prisma.InputJsonObject {
  return { mobs } as unknown as Prisma.InputJsonObject;
}

export function countEncounterSiteState(mobs: EncounterMobSlot[]): {
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

function roleOrder(role: EncounterMobRole): number {
  if (role === 'trash') return 0;
  if (role === 'elite') return 1;
  return 2;
}

function getNextEncounterMob(mobs: EncounterMobSlot[]): EncounterMobSlot | null {
  const alive = mobs.filter((mob) => mob.status === 'alive');
  if (alive.length === 0) return null;
  alive.sort((a, b) => {
    const roleDiff = roleOrder(a.role) - roleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.slot - b.slot;
  });
  return alive[0] ?? null;
}

function getNextEncounterMobInRoom(mobs: EncounterMobSlot[], roomNumber: number): EncounterMobSlot | null {
  const alive = mobs.filter((mob) => mob.status === 'alive' && mob.room === roomNumber);
  if (alive.length === 0) return null;
  alive.sort((a, b) => {
    const roleDiff = roleOrder(a.role) - roleOrder(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.slot - b.slot;
  });
  return alive[0] ?? null;
}

export function getAllAliveMobsInRoom(mobs: EncounterMobSlot[], roomNumber: number): EncounterMobSlot[] {
  return mobs
    .filter((mob) => mob.status === 'alive' && mob.room === roomNumber)
    .sort((a, b) => {
      const roleDiff = roleOrder(a.role) - roleOrder(b.role);
      if (roleDiff !== 0) return roleDiff;
      return a.slot - b.slot;
    });
}

export function getRoomState(mobs: EncounterMobSlot[], roomNumber: number): {
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

function getMaxRoom(mobs: EncounterMobSlot[]): number {
  return Math.max(...mobs.map(m => m.room), 1);
}

export function getNextUnfinishedRoom(mobs: EncounterMobSlot[], startRoom: number): number | null {
  const maxRoom = getMaxRoom(mobs);
  for (let r = startRoom; r <= maxRoom; r++) {
    const state = getRoomState(mobs, r);
    if (state.alive > 0) return r;
  }
  return null;
}

export function applyEncounterSiteDecayInMemory(mobs: EncounterMobSlot[], discoveredAt: Date, now: Date): {
  mobs: EncounterMobSlot[];
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
  mobs: EncounterMobSlot[];
  state: { total: number; alive: number; defeated: number; decayed: number };
  nextMob: EncounterMobSlot | null;
} | null> {
  const parsed = parseEncounterSiteMobs(site.mobs);
  if (parsed.length === 0) {
    await prisma.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
    return null;
  }

  const decayed = applyEncounterSiteDecayInMemory(parsed, site.discoveredAt, now);
  if (decayed.changed) {
    const postDecay = countEncounterSiteState(decayed.mobs);
    if (postDecay.alive <= 0) {
      await prisma.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
      return null;
    }

    await prisma.encounterSite.update({
      where: { id: site.id },
      data: { mobs: serializeEncounterSiteMobs(decayed.mobs) },
    });
  }

  const state = countEncounterSiteState(decayed.mobs);
  if (state.alive <= 0) {
    await prisma.encounterSite.deleteMany({ where: { id: site.id, playerId: site.playerId } });
    return null;
  }

  return {
    mobs: decayed.mobs,
    state,
    nextMob: getNextEncounterMob(decayed.mobs),
  };
}

export interface FightResult {
  room: number;
  slot: number;
  mobName: string;
  mobDisplayName: string;
  mobTemplateId: string;
  mobPrefix: string | null;
  outcome: string;
  playerMaxHp: number;
  playerStartHp: number;
  playerStartStamina: number;
  playerStartMana: number;
  mobMaxHp: number;
  log: unknown[];
  playerHpRemaining: number;
  potionsConsumed: PotionConsumed[];
  xp: number;
  loot: LootDropWithName[];
  durabilityLost: Awaited<ReturnType<typeof degradeEquippedDurability>>;
  skillXpGrants: Awaited<ReturnType<typeof grantSkillXp>>[];
}
