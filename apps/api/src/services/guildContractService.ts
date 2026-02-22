import { prisma } from '@adventure/database';
import {
  GUILD_CONTRACT_DEFINITIONS,
  GUILD_CONTRACT_CONSTANTS,
  type GuildContractData,
  type GuildContractType,
} from '@adventure/shared';
import { addGuildXp, checkGuildAchievementsForAllMembers } from './guildService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWeekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

function getWeekEnd(weekStart: Date): Date {
  const d = new Date(weekStart);
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

function getLevelBracket(guildLevel: number): 'low' | 'mid' | 'high' {
  if (guildLevel <= 10) return 'low';
  if (guildLevel <= 25) return 'mid';
  return 'high';
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toContractData(row: {
  id: string;
  contractKey: string;
  targetValue: number;
  currentValue: number;
  status: string;
  rewardGuildXp: number;
  rewardTreasuryTurns: number;
  weekStartedAt: Date;
  expiresAt: Date;
}): GuildContractData {
  const def = GUILD_CONTRACT_DEFINITIONS.find((d) => d.key === row.contractKey);
  return {
    id: row.id,
    contractKey: row.contractKey,
    name: def?.name ?? row.contractKey,
    targetValue: row.targetValue,
    currentValue: row.currentValue,
    status: row.status as 'active' | 'completed' | 'expired',
    rewardGuildXp: row.rewardGuildXp,
    rewardTreasuryTurns: row.rewardTreasuryTurns,
    weekStartedAt: row.weekStartedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Generate Weekly Contracts
// ---------------------------------------------------------------------------

export async function generateWeeklyContracts(guildId: string, now: Date = new Date()): Promise<GuildContractData[]> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { level: true } });
  if (!guild) return [];

  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(weekStart);
  const bracket = getLevelBracket(guild.level);
  const { CONTRACTS_PER_WEEK, MIN_CATEGORIES, REWARD_GUILD_XP_MIN, REWARD_GUILD_XP_MAX, REWARD_TREASURY_MIN, REWARD_TREASURY_MAX } = GUILD_CONTRACT_CONSTANTS;

  // Pick contracts ensuring at least MIN_CATEGORIES distinct categories
  const allDefs = [...GUILD_CONTRACT_DEFINITIONS];
  const selected: typeof allDefs = [];
  const usedCategories = new Set<string>();

  // Shuffle
  for (let i = allDefs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allDefs[i], allDefs[j]] = [allDefs[j]!, allDefs[i]!];
  }

  // First pass: pick from different categories
  for (const def of allDefs) {
    if (selected.length >= CONTRACTS_PER_WEEK) break;
    if (!usedCategories.has(def.category) && usedCategories.size < MIN_CATEGORIES) {
      selected.push(def);
      usedCategories.add(def.category);
    }
  }

  // Second pass: fill remaining slots
  for (const def of allDefs) {
    if (selected.length >= CONTRACTS_PER_WEEK) break;
    if (!selected.includes(def)) {
      selected.push(def);
      usedCategories.add(def.category);
    }
  }

  // Ensure category spread: if only 1 category, swap last pick
  if (usedCategories.size < MIN_CATEGORIES && selected.length >= MIN_CATEGORIES) {
    const differentCatDef = allDefs.find((d) => !usedCategories.has(d.category) && !selected.includes(d));
    if (differentCatDef) {
      selected[selected.length - 1] = differentCatDef;
    }
  }

  const contracts = await prisma.$transaction(async (tx: any) => {
    const created: any[] = [];
    for (const def of selected) {
      const contract = await tx.guildContract.create({
        data: {
          guildId,
          contractKey: def.key,
          targetValue: def.targets[bracket],
          currentValue: 0,
          status: 'active',
          rewardGuildXp: randomInt(REWARD_GUILD_XP_MIN, REWARD_GUILD_XP_MAX),
          rewardTreasuryTurns: randomInt(REWARD_TREASURY_MIN, REWARD_TREASURY_MAX),
          weekStartedAt: weekStart,
          expiresAt: weekEnd,
        },
      });
      created.push(contract);
    }

    await tx.guildLog.create({
      data: {
        guildId,
        eventType: 'contracts_generated',
        message: `${created.length} weekly contracts generated`,
      },
    });

    return created;
  });

  return contracts.map(toContractData);
}

// ---------------------------------------------------------------------------
// Get Active Contracts (with lazy generation)
// ---------------------------------------------------------------------------

export async function getActiveContracts(guildId: string, now: Date = new Date()): Promise<GuildContractData[]> {
  const weekStart = getWeekStart(now);

  // Find contracts for the current week
  const contracts = await prisma.guildContract.findMany({
    where: {
      guildId,
      weekStartedAt: { gte: weekStart },
    },
    orderBy: { contractKey: 'asc' },
  });

  // If no contracts for this week, generate new ones
  if (contracts.length === 0) {
    // Mark old active contracts as expired
    await prisma.guildContract.updateMany({
      where: { guildId, status: 'active', expiresAt: { lt: now } },
      data: { status: 'expired' },
    });
    return generateWeeklyContracts(guildId, now);
  }

  return contracts.map(toContractData);
}

// ---------------------------------------------------------------------------
// Increment Contract Progress
// ---------------------------------------------------------------------------

export async function incrementContractProgress(
  guildId: string,
  contractType: GuildContractType,
  amount: number,
): Promise<void> {
  if (amount <= 0) return;

  const now = new Date();
  const weekStart = getWeekStart(now);

  // Find matching active contract
  const contract = await prisma.guildContract.findFirst({
    where: {
      guildId,
      contractKey: contractType,
      status: 'active',
      weekStartedAt: { gte: weekStart },
      expiresAt: { gt: now },
    },
  });

  if (!contract) return;

  const newValue = contract.currentValue + amount;

  if (newValue >= contract.targetValue) {
    // Contract completed
    await prisma.$transaction(async (tx: any) => {
      await tx.guildContract.update({
        where: { id: contract.id },
        data: { currentValue: newValue, status: 'completed' },
      });

      // Award treasury
      await tx.guild.update({
        where: { id: guildId },
        data: { treasuryTurns: { increment: contract.rewardTreasuryTurns } },
      });

      await tx.guildLog.create({
        data: {
          guildId,
          eventType: 'contract_completed',
          message: `Contract "${GUILD_CONTRACT_DEFINITIONS.find((d) => d.key === contractType)?.name ?? contractType}" completed! +${contract.rewardGuildXp} Guild XP, +${contract.rewardTreasuryTurns} treasury turns`,
          metadata: { contractKey: contractType, rewardXp: contract.rewardGuildXp, rewardTreasury: contract.rewardTreasuryTurns },
        },
      });
    });

    // Award guild XP (outside transaction since addGuildXp uses its own)
    await addGuildXp(guildId, contract.rewardGuildXp);

    // Fire-and-forget: check contract completion achievements for all members
    void checkGuildAchievementsForAllMembers(guildId, ['guildContractsCompleted']);
  } else {
    // Just increment
    await prisma.guildContract.update({
      where: { id: contract.id },
      data: { currentValue: newValue },
    });
  }
}

export { getWeekStart };
