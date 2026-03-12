import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { getExpeditionBestiary } from './expeditionBestiaryService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getExpeditionBestiary', () => {
  it('returns all themes with attempted=false when player has no kills', async () => {
    mockPrisma.playerExpeditionBestiary.findMany.mockResolvedValue([]);

    const result = await getExpeditionBestiary('player1');

    expect(result.themes).toHaveLength(4);
    expect(result.themes.every((t: { attempted: boolean }) => !t.attempted)).toBe(true);
    expect(result.themes[0].mobs.length).toBeGreaterThan(0);
    result.themes[0].mobs.forEach((m: { killCount: number; stats: unknown; rotation: unknown }) => {
      expect(m.killCount).toBe(0);
      expect(m.stats).toBeNull();
      expect(m.rotation).toBeNull();
    });
  });

  it('marks theme as attempted when player has kills in it', async () => {
    mockPrisma.playerExpeditionBestiary.findMany.mockResolvedValue([
      { playerId: 'player1', mobTemplateId: 'expCavernSpider', theme: 'spider_nest', killCount: 2, firstEncounteredAt: new Date() },
    ]);

    const result = await getExpeditionBestiary('player1');

    const spiderNest = result.themes.find((t: { theme: string }) => t.theme === 'spider_nest')!;
    expect(spiderNest.attempted).toBe(true);

    const wolfPack = result.themes.find((t: { theme: string }) => t.theme === 'wolf_pack')!;
    expect(wolfPack.attempted).toBe(false);
  });

  it('reveals stats at 3+ kills', async () => {
    mockPrisma.playerExpeditionBestiary.findMany.mockResolvedValue([
      { playerId: 'player1', mobTemplateId: 'expCavernSpider', theme: 'spider_nest', killCount: 3, firstEncounteredAt: new Date() },
    ]);

    const result = await getExpeditionBestiary('player1');
    const mob = result.themes
      .find((t: { theme: string }) => t.theme === 'spider_nest')!
      .mobs.find((m: { mobTemplateId: string }) => m.mobTemplateId === 'expCavernSpider')!;

    expect(mob.stats).not.toBeNull();
    expect(mob.stats!.hp).toBeGreaterThan(0);
    expect(mob.rotation).toBeNull();
  });

  it('reveals rotation at 5+ kills', async () => {
    mockPrisma.playerExpeditionBestiary.findMany.mockResolvedValue([
      { playerId: 'player1', mobTemplateId: 'expCavernSpider', theme: 'spider_nest', killCount: 5, firstEncounteredAt: new Date() },
    ]);

    const result = await getExpeditionBestiary('player1');
    const mob = result.themes
      .find((t: { theme: string }) => t.theme === 'spider_nest')!
      .mobs.find((m: { mobTemplateId: string }) => m.mobTemplateId === 'expCavernSpider')!;

    expect(mob.stats).not.toBeNull();
    expect(mob.rotation).not.toBeNull();
    expect(mob.rotation!.length).toBeGreaterThan(0);
  });
});
