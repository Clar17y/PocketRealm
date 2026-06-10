import { prisma as defaultPrisma } from '@pocketrealm/database';

/**
 * Narrow structural Prisma interfaces shared by the bot's database-backed
 * features (message XP and staff commands). Keeping these structural lets
 * tests inject small fakes without depending on the generated Prisma client.
 */

export interface DiscordCommunityProfileRecord {
  id: string;
  discordGuildId: string;
  discordUserId: string;
  xp: number;
  level: number;
  dailyXp: number;
  dailyXpDate: Date | null;
  excludedFromXp: boolean;
}

export interface DiscordXpEventRecord {
  id: string;
}

export type DiscordCommunityProfileWhere =
  | {
      discordGuildId_discordUserId: {
        discordGuildId: string;
        discordUserId: string;
      };
    }
  | { id: string };

export interface DiscordCommunityProfileUpdateData {
  xp?: number | { increment: number } | { decrement: number };
  level?: number;
  dailyXp?: number;
  dailyXpDate?: Date;
  lastXpGrantedAt?: Date;
  lastRoleSyncAt?: Date;
}

export interface DiscordCommunityProfileCreateData {
  discordGuildId: string;
  discordUserId: string;
  xp: number;
  level: number;
  dailyXp: number;
  dailyXpDate?: Date;
  lastXpGrantedAt?: Date;
}

export interface DiscordCommunityProfileDelegate {
  findUnique(args: {
    where: DiscordCommunityProfileWhere;
  }): Promise<DiscordCommunityProfileRecord | null>;
  update(args: {
    where: { id: string };
    data: DiscordCommunityProfileUpdateData;
  }): Promise<DiscordCommunityProfileRecord>;
  updateMany(args: {
    where: {
      id: string;
      xp?: number;
    };
    data: {
      xp: { decrement: number };
    };
  }): Promise<{ count: number }>;
  create(args: {
    data: DiscordCommunityProfileCreateData;
  }): Promise<DiscordCommunityProfileRecord>;
}

export interface DiscordXpEventDelegate {
  findUnique(args: {
    where: {
      discordGuildId_messageId: {
        discordGuildId: string;
        messageId: string;
      };
    };
  }): Promise<DiscordXpEventRecord | null>;
  findFirst(args: {
    where: {
      discordGuildId: string;
      discordUserId: string;
      messageFingerprint: string;
      createdAt: { gte: Date };
    };
    select: { id: true };
  }): Promise<DiscordXpEventRecord | null>;
  create(args: {
    data: {
      discordGuildId: string;
      discordUserId: string;
      channelId: string;
      messageId: string;
      messageFingerprint: string;
      xp: number;
      reason: string;
      createdAt: Date;
    };
  }): Promise<DiscordXpEventRecord>;
}

export interface DiscordBotAuditEventDelegate {
  create(args: {
    data: {
      guildId: string;
      actorDiscordUserId: string;
      targetDiscordUserId?: string;
      command: string;
      status: string;
      errorCode?: string;
      metadata?: Record<string, unknown>;
    };
  }): Promise<unknown>;
}

export interface MessageXpTransactionClient {
  discordCommunityProfile: DiscordCommunityProfileDelegate;
  discordXpEvent: DiscordXpEventDelegate;
}

export interface MessageXpPrismaClient extends MessageXpTransactionClient {
  $transaction<T>(callback: (tx: MessageXpTransactionClient) => Promise<T>): Promise<T>;
}

export interface StaffTransactionClient {
  discordCommunityProfile: DiscordCommunityProfileDelegate;
  discordBotAuditEvent: DiscordBotAuditEventDelegate;
}

export interface StaffPrismaClient extends StaffTransactionClient {
  $transaction<T>(callback: (tx: StaffTransactionClient) => Promise<T>): Promise<T>;
}

/**
 * The generated Prisma client is runtime-compatible with the narrow structural
 * interfaces above, but TypeScript cannot prove it across the generated
 * delegate generics. This accessor is the single sanctioned `as unknown as`
 * cast for Prisma in the bot; never cast Prisma clients anywhere else.
 */
export function getDefaultDiscordPrisma(): MessageXpPrismaClient & StaffPrismaClient {
  return defaultPrisma as unknown as MessageXpPrismaClient & StaffPrismaClient;
}
