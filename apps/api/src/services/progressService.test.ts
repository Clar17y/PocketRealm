import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../__test__/setup';
import { trackProgress } from './progressService';

const mockGetPlayerGuildId = vi.fn();
const mockIncrementContractProgress = vi.fn();
const mockIncrementQuestProgress = vi.fn();

vi.mock('./guildService', () => ({
  getPlayerGuildId: (...args: unknown[]) => mockGetPlayerGuildId(...args),
}));

vi.mock('./guildContractService', () => ({
  incrementContractProgress: (...args: unknown[]) => mockIncrementContractProgress(...args),
}));

vi.mock('./questService', () => ({
  incrementQuestProgress: (...args: unknown[]) => mockIncrementQuestProgress(...args),
}));

describe('trackProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIncrementQuestProgress.mockResolvedValue([]);
  });

  it('calls both guild contract and quest progress when player is in guild', async () => {
    mockGetPlayerGuildId.mockResolvedValue('guild-1');
    mockIncrementContractProgress.mockResolvedValue(undefined);
    await trackProgress('player-1', 'kill_count', 1);
    expect(mockGetPlayerGuildId).toHaveBeenCalledWith('player-1');
    expect(mockIncrementContractProgress).toHaveBeenCalledWith('guild-1', 'kill_count', 1);
    expect(mockIncrementQuestProgress).toHaveBeenCalledWith('player-1', 'kill_count', 1, undefined);
  });

  it('skips guild contract when player has no guild', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);
    await trackProgress('player-1', 'kill_count', 1);
    expect(mockIncrementContractProgress).not.toHaveBeenCalled();
    expect(mockIncrementQuestProgress).toHaveBeenCalled();
  });

  it('returns quest progress updates', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);
    mockIncrementQuestProgress.mockResolvedValue([
      { questId: 'q1', questName: 'Slay Monsters', current: 3, target: 15, completed: false },
    ]);
    const result = await trackProgress('player-1', 'kill_count', 1);
    expect(result).toHaveLength(1);
    expect(result[0].questName).toBe('Slay Monsters');
  });

  it('passes metadata to quest progress', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);
    await trackProgress('player-1', 'kill_prefix', 1, { prefix: 'ancient' });
    expect(mockIncrementQuestProgress).toHaveBeenCalledWith('player-1', 'kill_prefix', 1, { prefix: 'ancient' });
  });

  it('returns empty array when amount is 0', async () => {
    const result = await trackProgress('player-1', 'kill_count', 0);
    expect(result).toEqual([]);
    expect(mockGetPlayerGuildId).not.toHaveBeenCalled();
  });

  it('still returns quest updates even if guild contract fails', async () => {
    mockGetPlayerGuildId.mockResolvedValue('guild-1');
    mockIncrementContractProgress.mockRejectedValue(new Error('DB error'));
    mockIncrementQuestProgress.mockResolvedValue([
      { questId: 'q1', questName: 'Test', current: 1, target: 5, completed: false },
    ]);
    const result = await trackProgress('player-1', 'kill_count', 1);
    expect(result).toHaveLength(1);
  });

  it('does not call guild contract for non-contract types (casino_wagers)', async () => {
    mockGetPlayerGuildId.mockResolvedValue('guild-1');
    await trackProgress('player-1', 'casino_wagers', 100);
    expect(mockIncrementContractProgress).not.toHaveBeenCalled();
    expect(mockIncrementQuestProgress).toHaveBeenCalledWith('player-1', 'casino_wagers', 100, undefined);
  });

  it('returns completed quest progress updates for frontend notification', async () => {
    mockGetPlayerGuildId.mockResolvedValue(null);
    mockIncrementQuestProgress.mockResolvedValue([
      { questId: 'q1', questName: 'Slay 10 Monsters', current: 10, target: 10, completed: true },
      { questId: 'q2', questName: 'Gather Resources', current: 3, target: 5, completed: false },
    ]);
    const result = await trackProgress('player-1', 'kill_count', 2);
    expect(result).toHaveLength(2);

    const completedUpdate = result.find(u => u.questId === 'q1');
    expect(completedUpdate).toBeDefined();
    expect(completedUpdate!.completed).toBe(true);
    expect(completedUpdate!.current).toBe(completedUpdate!.target);

    const activeUpdate = result.find(u => u.questId === 'q2');
    expect(activeUpdate).toBeDefined();
    expect(activeUpdate!.completed).toBe(false);
  });
});
