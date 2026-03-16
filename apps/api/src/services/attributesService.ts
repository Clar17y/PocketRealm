import { prisma } from '@pocketrealm/database';
import {
  ATTRIBUTE_TYPES,
  DEFAULT_PLAYER_ATTRIBUTES,
  type AttributeType,
  type PlayerAttributes,
} from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';


function coerceAttributeValue(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function normalizePlayerAttributes(raw: unknown): PlayerAttributes {
  const base: PlayerAttributes = { ...DEFAULT_PLAYER_ATTRIBUTES };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;

  for (const attribute of ATTRIBUTE_TYPES) {
    base[attribute] = coerceAttributeValue((raw as Record<string, number>)[attribute]);
  }

  return base;
}

export interface PlayerProgressionState {
  characterXp: number;
  characterLevel: number;
  attributePoints: number;
  attributes: PlayerAttributes;
}

export async function getPlayerProgressionState(playerId: string): Promise<PlayerProgressionState> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      characterXp: true,
      characterLevel: true,
      attributePoints: true,
      attributes: true,
    },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  return {
    characterXp: Number(player.characterXp),
    characterLevel: player.characterLevel,
    attributePoints: player.attributePoints,
    attributes: normalizePlayerAttributes(player.attributes),
  };
}

export async function allocateAttributePoints(
  playerId: string,
  attribute: AttributeType,
  points: number
): Promise<PlayerProgressionState> {
  const spendPoints = Math.max(0, Math.floor(points));
  if (spendPoints <= 0) {
    throw new AppError(400, 'Points must be a positive integer', 'INVALID_POINTS');
  }

  return prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id: playerId },
      select: {
        characterXp: true,
        characterLevel: true,
        attributePoints: true,
        attributes: true,
      },
    });

    if (!player) {
      throw new AppError(404, 'Player not found', 'NOT_FOUND');
    }

    if (player.attributePoints < spendPoints) {
      throw new AppError(400, 'Not enough unspent attribute points', 'INSUFFICIENT_ATTRIBUTE_POINTS');
    }

    const attributes = normalizePlayerAttributes(player.attributes);
    attributes[attribute] += spendPoints;

    const updated = await tx.player.update({
      where: { id: playerId },
      data: {
        attributePoints: player.attributePoints - spendPoints,
        attributes: { ...attributes },
      },
      select: {
        characterXp: true,
        characterLevel: true,
        attributePoints: true,
        attributes: true,
      },
    });

    return {
      characterXp: Number(updated.characterXp),
      characterLevel: updated.characterLevel,
      attributePoints: updated.attributePoints,
      attributes: normalizePlayerAttributes(updated.attributes),
    };
  });
}
