import { prisma } from '@adventure/database';
import {
  GUILD_CONSTANTS,
  GUILD_UPGRADE_DEFINITIONS,
  GUILD_PROJECT_DEFINITIONS,
  GUILD_SPECIALIZATION_DEFINITIONS,
  type GuildUpgradeData,
  type GuildUpgradeEffectType,
} from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import { requireRole } from './guildService';
import { isActiveWithinWindow } from './guildService';

function toUpgradeData(row: {
  id: string;
  upgradeType: string;
  tier: number;
  activatedAt: Date;
  expiresAt: Date;
  activatedBy: string;
}): GuildUpgradeData {
  const def = GUILD_UPGRADE_DEFINITIONS.find((d) => d.key === row.upgradeType);
  const tierDef = def?.tiers.find((t) => t.level === row.tier);
  return {
    id: row.id,
    upgradeKey: row.upgradeType,
    tier: row.tier,
    effectType: def?.effectType ?? row.upgradeType,
    effectValue: tierDef?.effectValue ?? 0,
    activatedAt: row.activatedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    activatedBy: row.activatedBy,
  };
}

// ---------------------------------------------------------------------------
// Activate Upgrade
// ---------------------------------------------------------------------------

export async function activateUpgrade(
  requesterId: string,
  guildId: string,
  upgradeKey: string,
  tierLevel: number,
): Promise<GuildUpgradeData> {
  // Validate upgrade definition
  const def = GUILD_UPGRADE_DEFINITIONS.find((d) => d.key === upgradeKey);
  if (!def) throw new AppError(400, 'Unknown upgrade type', 'INVALID_UPGRADE');

  const tierDef = def.tiers.find((t) => t.level === tierLevel);
  if (!tierDef) throw new AppError(400, 'Invalid upgrade tier', 'INVALID_TIER');

  // Validate requester is officer+
  const membership = await requireRole(requesterId, 'officer');
  if (membership.guildId !== guildId) {
    throw new AppError(403, 'Not in this guild', 'NOT_IN_GUILD');
  }
  const guild = membership.guild;

  // Validate guild level
  if (guild.level < tierDef.level) {
    throw new AppError(400, `Guild level ${tierDef.level} required for this tier`, 'GUILD_LEVEL_TOO_LOW');
  }

  // Early check (non-authoritative, just for fast feedback)
  if (guild.treasuryTurns < tierDef.cost) {
    throw new AppError(400, 'Insufficient treasury funds', 'INSUFFICIENT_TREASURY');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + tierDef.durationMs);

  // Transaction: re-validate treasury + duplicate, then deduct and create
  const upgrade = await prisma.$transaction(async (tx: any) => {
    // Re-check treasury inside transaction to prevent TOCTOU race
    const freshGuild = await tx.guild.findUnique({ where: { id: guildId }, select: { treasuryTurns: true } });
    if (!freshGuild || freshGuild.treasuryTurns < tierDef.cost) {
      throw new AppError(400, 'Insufficient treasury funds', 'INSUFFICIENT_TREASURY');
    }

    // Check no active upgrade of same type inside transaction
    const existing = await tx.guildUpgrade.findFirst({
      where: { guildId, upgradeType: upgradeKey, expiresAt: { gt: now } },
    });
    if (existing) {
      throw new AppError(400, 'An upgrade of this type is already active', 'UPGRADE_ALREADY_ACTIVE');
    }

    await tx.guild.update({
      where: { id: guildId },
      data: { treasuryTurns: { decrement: tierDef.cost } },
    });

    const created = await tx.guildUpgrade.create({
      data: {
        guildId,
        upgradeType: upgradeKey,
        tier: tierDef.level,
        activatedAt: now,
        expiresAt,
        activatedBy: requesterId,
      },
    });

    await tx.guildLog.create({
      data: {
        guildId,
        eventType: 'upgrade_activated',
        message: `${def.name} (Tier ${tierDef.level}) activated for ${tierDef.durationMs / (60 * 60 * 1000)}h`,
        metadata: { upgradeKey, tier: tierDef.level, cost: tierDef.cost },
      },
    });

    return created;
  });

  return toUpgradeData(upgrade);
}

// ---------------------------------------------------------------------------
// Get Active Upgrades
// ---------------------------------------------------------------------------

export async function getActiveUpgrades(guildId: string): Promise<GuildUpgradeData[]> {
  const now = new Date();
  const rows = await prisma.guildUpgrade.findMany({
    where: { guildId, expiresAt: { gt: now } },
    orderBy: { activatedAt: 'desc' },
  });
  return rows.map(toUpgradeData);
}

// ---------------------------------------------------------------------------
// Get Available Upgrades (for UI)
// ---------------------------------------------------------------------------

export async function getAvailableUpgrades(guildId: string): Promise<Array<{
  key: string;
  name: string;
  effectType: GuildUpgradeEffectType;
  tiers: Array<{
    level: number;
    effectValue: number;
    cost: number;
    durationMs: number;
    available: boolean;
    reason?: string;
  }>;
  activeUpgrade: GuildUpgradeData | null;
}>> {
  const guild = await prisma.guild.findUnique({
    where: { id: guildId },
    select: { level: true, treasuryTurns: true },
  });
  if (!guild) throw new AppError(404, 'Guild not found', 'NOT_FOUND');

  const activeUpgrades = await getActiveUpgrades(guildId);
  const activeByKey = new Map(activeUpgrades.map((u) => [u.upgradeKey, u]));

  return GUILD_UPGRADE_DEFINITIONS.map((def) => ({
    key: def.key,
    name: def.name,
    effectType: def.effectType,
    tiers: def.tiers.map((tier) => {
      let available = true;
      let reason: string | undefined;
      if (guild.level < tier.level) {
        available = false;
        reason = `Requires guild level ${tier.level}`;
      } else if (guild.treasuryTurns < tier.cost) {
        available = false;
        reason = 'Insufficient treasury';
      } else if (activeByKey.has(def.key)) {
        available = false;
        reason = 'Already active';
      }
      return { level: tier.level, effectValue: tier.effectValue, cost: tier.cost, durationMs: tier.durationMs, available, reason };
    }),
    activeUpgrade: activeByKey.get(def.key) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Get Player Guild Upgrades (for route integration)
// ---------------------------------------------------------------------------

export interface PlayerGuildModifiers {
  xpBoost: number;
  gatheringYield: number;
  craftingCrit: number;
  combatDamage: number;
  defenseBoost: number;
  travelCostReduction: number;
  repairCostReduction: number;
}

const NO_MODIFIERS: PlayerGuildModifiers = {
  xpBoost: 0,
  gatheringYield: 0,
  craftingCrit: 0,
  combatDamage: 0,
  defenseBoost: 0,
  travelCostReduction: 0,
  repairCostReduction: 0,
};

export async function getPlayerGuildModifiers(playerId: string): Promise<PlayerGuildModifiers> {
  const membership = await prisma.guildMember.findUnique({
    where: { playerId },
    select: { guildId: true, lastActiveAt: true },
  });
  if (!membership) return { ...NO_MODIFIERS };

  // Check boost eligibility (active within 48h window)
  if (!isActiveWithinWindow(membership.lastActiveAt)) return { ...NO_MODIFIERS };

  const now = new Date();
  const activeUpgrades = await prisma.guildUpgrade.findMany({
    where: { guildId: membership.guildId, expiresAt: { gt: now } },
  });

  const mods: PlayerGuildModifiers = { ...NO_MODIFIERS };

  // Apply scaled upgrade bonuses if any are active
  if (activeUpgrades.length > 0) {
    const members = await prisma.guildMember.findMany({
      where: { guildId: membership.guildId },
      select: { lastActiveAt: true },
    });
    const activeCount = members.filter((m) => isActiveWithinWindow(m.lastActiveAt)).length;

    let scale: number = GUILD_CONSTANTS.BOOST_SCALING_LOW;
    if (activeCount >= GUILD_CONSTANTS.BOOST_SCALING_MIN_FULL) {
      scale = GUILD_CONSTANTS.BOOST_SCALING_FULL;
    } else if (activeCount >= GUILD_CONSTANTS.BOOST_SCALING_MIN_MEDIUM) {
      scale = GUILD_CONSTANTS.BOOST_SCALING_MEDIUM;
    }

    for (const upgrade of activeUpgrades) {
      const def = GUILD_UPGRADE_DEFINITIONS.find((d) => d.key === upgrade.upgradeType);
      if (!def) continue;
      const tierDef = def.tiers.find((t) => t.level === upgrade.tier);
      if (!tierDef) continue;

      const scaledValue = tierDef.effectValue * scale;

      switch (def.effectType) {
        case 'xp_boost': mods.xpBoost += scaledValue; break;
        case 'gathering_yield': mods.gatheringYield += scaledValue; break;
        case 'crafting_crit': mods.craftingCrit += scaledValue; break;
        case 'combat_damage': mods.combatDamage += scaledValue; break;
        case 'defense_boost': mods.defenseBoost += scaledValue; break;
      }
    }
  }

  // --- Project perks (permanent, highest per effectType wins, then added to mods) ---
  const completedProjects = await prisma.guildProject.findMany({
    where: { guildId: membership.guildId, status: 'completed' },
    select: { projectKey: true },
  });

  const projectPerks: Partial<Record<keyof PlayerGuildModifiers, number>> = {};
  for (const project of completedProjects) {
    const def = GUILD_PROJECT_DEFINITIONS.find((d) => d.key === project.projectKey);
    if (!def) continue;
    for (const perk of def.perks) {
      const key = perk.effectType as keyof PlayerGuildModifiers;
      if (key in mods) {
        projectPerks[key] = Math.max(projectPerks[key] ?? 0, perk.value);
      }
    }
  }
  for (const [key, value] of Object.entries(projectPerks)) {
    mods[key as keyof PlayerGuildModifiers] += value;
  }

  // --- Specialization bonuses (additive on top) ---
  const guild = await prisma.guild.findUnique({
    where: { id: membership.guildId },
    select: { specialization: true, level: true },
  });

  if (guild?.specialization) {
    const specDef = GUILD_SPECIALIZATION_DEFINITIONS.find(
      (s) => s.path === guild.specialization,
    );
    if (specDef) {
      const activeTier = specDef.tiers
        .filter((t) => guild.level >= t.guildLevelGate)
        .sort((a, b) => b.tier - a.tier)[0];
      if (activeTier) {
        for (const bonus of activeTier.bonuses) {
          const key = bonus.effectType as keyof PlayerGuildModifiers;
          if (key in mods) {
            mods[key] += bonus.value;
          }
        }
      }
    }
  }

  return mods;
}
