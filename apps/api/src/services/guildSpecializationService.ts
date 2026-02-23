import { prisma, Prisma } from '@adventure/database';
import {
  GUILD_CONSTANTS,
  GUILD_SPECIALIZATION_DEFINITIONS,
  type GuildSpecializationPath,
} from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';

const VALID_PATHS = new Set<string>(GUILD_SPECIALIZATION_DEFINITIONS.map((s) => s.path));

// ---------------------------------------------------------------------------
// Select Specialization
// ---------------------------------------------------------------------------

export async function selectSpecialization(
  playerId: string,
  guildId: string,
  path: GuildSpecializationPath,
) {
  if (!VALID_PATHS.has(path)) {
    throw new AppError(400, 'Invalid specialization path', 'INVALID_SPECIALIZATION');
  }

  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership || membership.guildId !== guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role !== 'leader') {
    throw new AppError(403, 'Only the leader can select a specialization', 'INSUFFICIENT_ROLE');
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { level: true, specialization: true },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  if (guild.level < GUILD_CONSTANTS.SPECIALIZATION_UNLOCK_LEVEL) {
    throw new AppError(
      400,
      `Guild must be level ${GUILD_CONSTANTS.SPECIALIZATION_UNLOCK_LEVEL} to select a specialization`,
      'GUILD_LEVEL_TOO_LOW',
    );
  }

  if (guild.specialization) {
    throw new AppError(400, 'Guild already has a specialization. Use respec to change.', 'SPECIALIZATION_EXISTS');
  }

  const specDef = GUILD_SPECIALIZATION_DEFINITIONS.find((s) => s.path === path)!;

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.guild.update({
      where: { id: guildId },
      data: { specialization: path },
    });

    await tx.guildLog.create({
      data: {
        guildId,
        eventType: 'specialization_selected',
        message: `${specDef.name} specialization selected`,
        metadata: { path },
      },
    });

    return result;
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Respec Specialization
// ---------------------------------------------------------------------------

export async function respecSpecialization(
  playerId: string,
  guildId: string,
  newPath: GuildSpecializationPath,
) {
  if (!VALID_PATHS.has(newPath)) {
    throw new AppError(400, 'Invalid specialization path', 'INVALID_SPECIALIZATION');
  }

  const membership = await prisma.guildMember.findUnique({ where: { playerId } });
  if (!membership || membership.guildId !== guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  if (membership.role !== 'leader') {
    throw new AppError(403, 'Only the leader can respec specialization', 'INSUFFICIENT_ROLE');
  }

  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { level: true, specialization: true, treasuryTurns: true },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  if (!guild.specialization) {
    throw new AppError(400, 'Guild has no specialization to respec from', 'NO_SPECIALIZATION');
  }

  if (guild.specialization === newPath) {
    throw new AppError(400, 'Cannot respec to same specialization', 'SAME_SPECIALIZATION');
  }

  const cost = GUILD_CONSTANTS.SPECIALIZATION_RESPEC_COST;
  if (guild.treasuryTurns < cost) {
    throw new AppError(
      400,
      `Insufficient treasury (need ${cost.toLocaleString()} turns)`,
      'INSUFFICIENT_TREASURY',
    );
  }

  const oldPath = guild.specialization;
  const specDef = GUILD_SPECIALIZATION_DEFINITIONS.find((s) => s.path === newPath)!;

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.guild.update({
      where: { id: guildId },
      data: {
        specialization: newPath,
        treasuryTurns: { decrement: cost },
      },
    });

    await tx.guildLog.create({
      data: {
        guildId,
        eventType: 'specialization_respec',
        message: `Specialization changed from ${oldPath} to ${specDef.name} (cost: ${cost.toLocaleString()} turns)`,
        metadata: { oldPath, newPath, cost },
      },
    });

    return result;
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Get Specialization Status
// ---------------------------------------------------------------------------

export async function getSpecializationStatus(guildId: string) {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { level: true, specialization: true },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  if (!guild.specialization) return null;

  const specDef = GUILD_SPECIALIZATION_DEFINITIONS.find(
    (s) => s.path === guild.specialization,
  );
  if (!specDef) return null;

  // Find highest qualifying tier
  const qualifyingTiers = specDef.tiers.filter((t) => guild.level >= t.guildLevelGate);
  const activeTierDef = qualifyingTiers.sort((a, b) => b.tier - a.tier)[0];

  // Find next tier (if any)
  const nextTierDef = specDef.tiers.find(
    (t) => t.tier === (activeTierDef ? activeTierDef.tier + 1 : 1),
  );

  return {
    path: specDef.path,
    name: specDef.name,
    description: specDef.description,
    activeTier: activeTierDef?.tier ?? 0,
    bonuses: activeTierDef?.bonuses ?? [],
    nextTier: nextTierDef
      ? {
          tier: nextTierDef.tier,
          guildLevelGate: nextTierDef.guildLevelGate,
          bonuses: nextTierDef.bonuses,
        }
      : null,
  };
}
