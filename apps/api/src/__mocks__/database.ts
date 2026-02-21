import { vi } from 'vitest';

// Minimal Prisma namespace mock for tagged template SQL queries
export const Prisma = {
  sql(strings: TemplateStringsArray, ...values: unknown[]) {
    return { strings, values };
  },
  join: vi.fn(),
};

// Deep mock factory for Prisma model methods
function mockModel() {
  return {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    aggregate: vi.fn(),
    count: vi.fn(),
  };
}

export const prisma = {
  player: mockModel(),
  turnBank: mockModel(),
  playerSkill: mockModel(),
  playerEquipment: mockModel(),
  item: mockModel(),
  itemTemplate: mockModel(),
  dropTable: mockModel(),
  chestDropTable: mockModel(),
  craftingRecipe: mockModel(),
  playerRecipe: mockModel(),
  zone: mockModel(),
  zoneConnection: mockModel(),
  playerZoneDiscovery: mockModel(),
  playerZoneExploration: mockModel(),
  chatMessage: mockModel(),
  playerStats: mockModel(),
  playerAchievement: mockModel(),
  mobFamily: mockModel(),
  activityLog: mockModel(),
  pvpRating: mockModel(),
  pvpCooldown: mockModel(),
  pvpMatch: mockModel(),
  worldEvent: mockModel(),
  bossEncounter: mockModel(),
  bossParticipant: mockModel(),
  persistedMob: mockModel(),
  mobTemplate: mockModel(),
  zoneMobFamily: mockModel(),
  resourceNode: mockModel(),
  playerBestiary: mockModel(),
  playerBestiaryPrefix: mockModel(),
  encounterSite: mockModel(),
  $transaction: vi.fn((fn: (tx: any) => Promise<any>) => fn(prisma)),
  $queryRaw: vi.fn(),
};
