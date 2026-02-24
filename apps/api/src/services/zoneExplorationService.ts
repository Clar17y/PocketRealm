import { prisma } from '@adventure/database';
import { prismaAny } from '../utils/prismaAny.js';


export function calculateExplorationPercent(turnsExplored: number, turnsToExplore: number | null): number {
  if (!turnsToExplore || turnsToExplore <= 0) return 100;
  return Math.min(100, (turnsExplored / turnsToExplore) * 100);
}

export async function getExplorationPercent(
  playerId: string,
  zoneId: string,
): Promise<{ turnsExplored: number; percent: number; turnsToExplore: number | null }> {
  const [record, zone] = await Promise.all([
    prismaAny.playerZoneExploration.findUnique({
      where: { playerId_zoneId: { playerId, zoneId } },
      select: { turnsExplored: true },
    }),
    prisma.zone.findUnique({
      where: { id: zoneId },
      select: { turnsToExplore: true },
    }),
  ]);

  const turnsExplored: number = record?.turnsExplored ?? 0;
  const turnsToExplore: number | null = zone?.turnsToExplore ?? null;
  const percent = calculateExplorationPercent(turnsExplored, turnsToExplore);

  return { turnsExplored, percent, turnsToExplore };
}

export async function addExplorationTurns(
  playerId: string,
  zoneId: string,
  turns: number,
  opts?: { turnsToExplore?: number | null; currentTurnsExplored?: number },
): Promise<void> {
  if (turns <= 0) return;

  // Use pre-fetched values when available, otherwise query DB
  let turnsToExplore: number | null;
  if (opts?.turnsToExplore !== undefined) {
    turnsToExplore = opts.turnsToExplore;
  } else {
    const zone = await prisma.zone.findUnique({
      where: { id: zoneId },
      select: { turnsToExplore: true },
    });
    turnsToExplore = zone?.turnsToExplore ?? null;
  }

  let clampedTurns = turns;

  if (turnsToExplore && turnsToExplore > 0) {
    let current: number;
    if (opts?.currentTurnsExplored !== undefined) {
      current = opts.currentTurnsExplored;
    } else {
      const record = await prismaAny.playerZoneExploration.findUnique({
        where: { playerId_zoneId: { playerId, zoneId } },
        select: { turnsExplored: true },
      });
      current = record?.turnsExplored ?? 0;
    }
    clampedTurns = Math.min(turns, Math.max(0, turnsToExplore - current));
    if (clampedTurns <= 0) return;
  }

  await prismaAny.playerZoneExploration.upsert({
    where: { playerId_zoneId: { playerId, zoneId } },
    create: { playerId, zoneId, turnsExplored: clampedTurns },
    update: { turnsExplored: { increment: clampedTurns } },
  });
}
