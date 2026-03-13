import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { getWorldBossBestiary } from './bossBestiaryService';

const GORRATH_TEMPLATE = {
  id: 'gorrath', name: 'Gorrath the Undying',
  hp: 2000, accuracy: 180, defence: 95, bossBaseHp: 400,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.mobTemplate.findMany.mockResolvedValue([GORRATH_TEMPLATE]);
});

describe('getWorldBossBestiary', () => {
  it('returns boss roster with zero defeats for new player', async () => {
    mockPrisma.bossParticipant.findMany.mockResolvedValue([]);

    const result = await getWorldBossBestiary('player1');

    expect(result.bosses).toHaveLength(1);
    expect(result.bosses[0].defeatCount).toBe(0);
    expect(result.bosses[0].hpPerParticipant).toBeNull();
    expect(result.bosses[0].stats).toBeNull();
    expect(result.bosses[0].rotation).toBeNull();
  });

  it('reveals hpPerParticipant at 1+ defeats', async () => {
    mockPrisma.bossParticipant.findMany.mockResolvedValue([
      { encounterId: 'enc1', playerId: 'player1', encounter: { mobTemplateId: 'gorrath', status: 'defeated', baseHp: 400 } },
    ]);

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'gorrath');

    expect(boss).toBeDefined();
    expect(boss!.defeatCount).toBe(1);
    expect(boss!.hpPerParticipant).not.toBeNull();
    expect(boss!.stats).toBeNull();
  });

  it('reveals stats at 3+ defeats', async () => {
    mockPrisma.bossParticipant.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        encounterId: `enc${i}`, playerId: 'player1',
        encounter: { mobTemplateId: 'gorrath', status: 'defeated', baseHp: 400 },
      })),
    );

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'gorrath');

    expect(boss!.defeatCount).toBe(3);
    expect(boss!.stats).not.toBeNull();
    expect(boss!.rotation).toBeNull();
  });

  it('reveals rotation at 5+ defeats', async () => {
    mockPrisma.bossParticipant.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        encounterId: `enc${i}`, playerId: 'player1',
        encounter: { mobTemplateId: 'gorrath', status: 'defeated', baseHp: 400 },
      })),
    );

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'gorrath');

    expect(boss!.defeatCount).toBe(5);
    // Gorrath the Undying is not in BOSS_TEMPLATES (keyed by display name),
    // so rotation will be null for unknown bosses
    expect(boss!.rotation).toBeNull();
  });

  it('deduplicates multi-round participations for the same encounter', async () => {
    // 3 rounds in the same encounter should count as 1 defeat
    mockPrisma.bossParticipant.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({
        encounterId: 'enc1', playerId: 'player1', roundNumber: i + 1,
        encounter: { mobTemplateId: 'gorrath', status: 'defeated', baseHp: 400 },
      })),
    );

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'gorrath');

    expect(boss!.defeatCount).toBe(1);
  });

  it('reveals rotation for bosses with known templates', async () => {
    const stoneColossus = {
      id: 'stone-colossus', name: 'Stone Colossus',
      hp: 3000, accuracy: 200, defence: 120, bossBaseHp: 500,
    };
    mockPrisma.mobTemplate.findMany.mockResolvedValue([stoneColossus]);
    mockPrisma.bossParticipant.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        encounterId: `enc${i}`, playerId: 'player1',
        encounter: { mobTemplateId: 'stone-colossus', status: 'defeated', baseHp: 500 },
      })),
    );

    const result = await getWorldBossBestiary('player1');
    const boss = result.bosses.find(b => b.bossTemplateId === 'stone-colossus');

    expect(boss!.defeatCount).toBe(5);
    expect(boss!.rotation).not.toBeNull();
    expect(boss!.rotation!.length).toBeGreaterThan(0);
    expect(boss!.rotation![0].round).toBe(1);
  });
});
