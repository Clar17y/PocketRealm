import { vi } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { prisma } from '@pocketrealm/database';

/** Pre-cast mock Prisma client for use in tests. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockPrisma = prisma as unknown as Record<string, any>;
