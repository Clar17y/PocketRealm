import { vi } from 'vitest';

vi.mock('@adventure/database', () => import('../__mocks__/database.js'));

import { prisma } from '@adventure/database';

/** Pre-cast mock Prisma client for use in tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockPrisma = prisma as unknown as Record<string, any>;
