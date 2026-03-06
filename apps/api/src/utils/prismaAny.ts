import { prisma } from '@pocketrealm/database';

/**
 * Untyped Prisma client for models not yet in the generated schema.
 * Import from here instead of casting per-file.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prismaAny = prisma as unknown as any;
