import { prisma } from '@pocketrealm/database';
import { WORLD_EVENT_CONSTANTS } from '@pocketrealm/shared';
import type { PersistedMobData } from '@pocketrealm/shared';
import { calculatePersistedMobHp } from '@pocketrealm/game-engine';

function toPersistedMobData(row: {
  id: string;
  playerId: string;
  mobTemplateId: string;
  zoneId: string;
  currentHp: number;
  maxHp: number;
  damagedAt: Date;
}): PersistedMobData {
  return {
    id: row.id,
    playerId: row.playerId,
    mobTemplateId: row.mobTemplateId,
    zoneId: row.zoneId,
    currentHp: row.currentHp,
    maxHp: row.maxHp,
    damagedAt: row.damagedAt.toISOString(),
  };
}

export async function persistMobHp(
  playerId: string,
  mobTemplateId: string,
  zoneId: string,
  currentHp: number,
  maxHp: number,
): Promise<void> {
  if (currentHp >= maxHp) {
    await prisma.persistedMob.deleteMany({
      where: { playerId, mobTemplateId, zoneId },
    });
    return;
  }

  // Upsert: one persisted mob per player per mob template per zone
  const existing = await prisma.persistedMob.findFirst({
    where: { playerId, mobTemplateId, zoneId },
  });

  if (existing) {
    await prisma.persistedMob.update({
      where: { id: existing.id },
      data: { currentHp, maxHp, damagedAt: new Date() },
    });
  } else {
    await prisma.persistedMob.create({
      data: { playerId, mobTemplateId, zoneId, currentHp, maxHp },
    });
  }
}

export async function checkPersistedMobReencounter(
  playerId: string,
  zoneId: string,
  mobTemplateId: string,
): Promise<PersistedMobData | null> {
  const row = await prisma.persistedMob.findFirst({
    where: { playerId, mobTemplateId, zoneId },
  });
  if (!row) return null;

  const now = new Date();
  const regenHp = calculatePersistedMobHp(row.currentHp, row.maxHp, row.damagedAt, now);

  // Fully healed mobs are no longer eligible for persisted reencounters.
  if (regenHp >= row.maxHp) {
    await prisma.persistedMob.delete({ where: { id: row.id } });
    return null;
  }

  // Roll for reencounter
  if (Math.random() > WORLD_EVENT_CONSTANTS.PERSISTED_MOB_REENCOUNTER_CHANCE) {
    return null;
  }

  const data = toPersistedMobData({ ...row, currentHp: regenHp });
  return data;
}

export async function removePersistedMob(id: string): Promise<void> {
  await prisma.persistedMob.deleteMany({ where: { id } });
}

export async function cleanupFullyHealedMobs(): Promise<number> {
  const cutoff = new Date(
    Date.now() - WORLD_EVENT_CONSTANTS.PERSISTED_MOB_MAX_AGE_MINUTES * 60 * 1000,
  );
  const result = await prisma.persistedMob.deleteMany({
    where: { damagedAt: { lte: cutoff } },
  });
  return result.count;
}
