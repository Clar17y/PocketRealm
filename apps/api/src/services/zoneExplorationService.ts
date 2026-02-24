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
): Promise<void> {
  if (turns <= 0) return;

  const zone = await prisma.zone.findUnique({
    where: { id: zoneId },
    select: { turnsToExplore: true },
  });

  let clampedTurns = turns;

  if (zone?.turnsToExplore) {
    const record = await prismaAny.playerZoneExploration.findUnique({
      where: { playerId_zoneId: { playerId, zoneId } },
      select: { turnsExplored: true },
    });
    const current: number = record?.turnsExplored ?? 0;
    clampedTurns = Math.min(turns, Math.max(0, zone.turnsToExplore - current));
    if (clampedTurns <= 0) return;
  }

  await prismaAny.playerZoneExploration.upsert({
    where: { playerId_zoneId: { playerId, zoneId } },
    create: { playerId, zoneId, turnsExplored: clampedTurns },
    update: { turnsExplored: { increment: clampedTurns } },
  });
}
