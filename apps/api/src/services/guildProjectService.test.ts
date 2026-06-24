import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./guildUpgradeService', () => ({
  invalidateGuildModifiersForGuild: vi.fn(),
}));

const stateUpdateMocks = vi.hoisted(() => ({
  fetchItemDTOs: vi.fn(),
  fetchInventoryMeta: vi.fn(),
  fetchMaterialTotals: vi.fn(),
  buildInventoryStateUpdates: vi.fn(),
}));

vi.mock('./stateUpdateHelpers', () => ({
  fetchItemDTOs: stateUpdateMocks.fetchItemDTOs,
  fetchInventoryMeta: stateUpdateMocks.fetchInventoryMeta,
  fetchMaterialTotals: stateUpdateMocks.fetchMaterialTotals,
  buildInventoryStateUpdates: stateUpdateMocks.buildInventoryStateUpdates,
}));

import { GUILD_PROJECT_DEFINITIONS, GUILD_PROJECT_CONSTANTS } from '@pocketrealm/shared';
import { mockPrisma as db } from '../__test__/setup';

import {
  startProject,
  getGuildProjects,
  contributeTurns,
  contributeMaterials,
  getAvailableProjects,
} from './guildProjectService';

const GUILD_ID = 'guild-1';
const PLAYER_ID = 'player-1';

function makeMember(role: string, guild: Record<string, unknown> = {}) {
  return {
    guildId: GUILD_ID,
    playerId: PLAYER_ID,
    role,
    guild: { id: GUILD_ID, treasuryTurns: 600_000, level: 5, ...guild },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stateUpdateMocks.fetchItemDTOs.mockResolvedValue([]);
  stateUpdateMocks.fetchInventoryMeta.mockResolvedValue({ inventoryUsedSlots: 0 });
  stateUpdateMocks.fetchMaterialTotals.mockResolvedValue({});
  stateUpdateMocks.buildInventoryStateUpdates.mockImplementation((opts) => ({
    ...(opts.removed?.length ? { inventoryRemoved: opts.removed } : {}),
    ...(opts.updated?.length ? { inventoryUpdated: opts.updated } : {}),
    inventoryUsedSlots: opts.inventoryUsedSlots,
    ...(opts.materialTotals ? { materialTotals: opts.materialTotals } : {}),
  }));
});

describe('startProject', () => {
  it('starts a project when prerequisites are met and treasury is sufficient', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('leader'));
    db.guildProject.findFirst.mockResolvedValue(null);
    db.guildProject.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.guild.update.mockResolvedValue({});
    db.guildProject.create.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: {}, status: 'active',
      startedAt: new Date(), completedAt: null,
    });
    db.guildLog.create.mockResolvedValue({});

    const result = await startProject(PLAYER_ID, GUILD_ID, 'guild_forge');

    expect(result.projectKey).toBe('guild_forge');
    expect(result.status).toBe('active');
  });

  it('throws if player is not officer or leader', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('member'));

    await expect(startProject(PLAYER_ID, GUILD_ID, 'guild_forge'))
      .rejects.toThrow('Only officers and leaders can do this');
  });

  it('starts a project even with zero treasury (no treasury cost)', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('leader', { treasuryTurns: 0 }));
    db.guildProject.findFirst.mockResolvedValue(null);
    db.guildProject.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(db));
    db.guildProject.create.mockResolvedValue({ id: 'proj-1', projectKey: 'guild_forge', turnsContributed: 0, materialsProgress: {}, status: 'active', startedAt: new Date() });

    const result = await startProject(PLAYER_ID, GUILD_ID, 'guild_forge');
    expect(result.projectKey).toBe('guild_forge');
  });

  it('throws if another project is already active', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('leader'));
    db.guildProject.findFirst.mockResolvedValue({ id: 'existing-active' });

    await expect(startProject(PLAYER_ID, GUILD_ID, 'guild_forge'))
      .rejects.toThrow('already has an active project');
  });

  it('throws if prerequisites not met', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('leader', { treasuryTurns: 3_000_000, level: 10 }));
    db.guildProject.findFirst.mockResolvedValue(null);
    db.guildProject.findMany.mockResolvedValue([]);

    await expect(startProject(PLAYER_ID, GUILD_ID, 'advanced_forge'))
      .rejects.toThrow('Prerequisites not met');
  });

  it('throws if project already completed', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('leader'));
    db.guildProject.findFirst.mockResolvedValue(null);
    db.guildProject.findMany.mockResolvedValue([
      { projectKey: 'guild_forge', status: 'completed' },
    ]);

    await expect(startProject(PLAYER_ID, GUILD_ID, 'guild_forge'))
      .rejects.toThrow('already been completed');
  });

  it('allows starting apothecary with any one L1 project completed', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('leader', { treasuryTurns: 2_000_000, level: 10 }));
    db.guildProject.findFirst.mockResolvedValue(null);
    db.guildProject.findMany.mockResolvedValue([
      { projectKey: 'scout_network', status: 'completed' },
    ]);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.guild.update.mockResolvedValue({});
    db.guildProject.create.mockResolvedValue({
      id: 'proj-2', guildId: GUILD_ID, projectKey: 'apothecary',
      turnsContributed: 0, materialsProgress: {}, status: 'active',
      startedAt: new Date(), completedAt: null,
    });
    db.guildLog.create.mockResolvedValue({});

    const result = await startProject(PLAYER_ID, GUILD_ID, 'apothecary');
    expect(result.projectKey).toBe('apothecary');
  });

  it('throws for unknown project key', async () => {
    db.guildMember.findUnique.mockResolvedValue(makeMember('leader'));

    await expect(startProject(PLAYER_ID, GUILD_ID, 'nonexistent'))
      .rejects.toThrow('Unknown project');
  });
});

describe('getGuildProjects', () => {
  it('returns all projects with progress data', async () => {
    db.guildProject.findMany.mockResolvedValue([
      {
        id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
        turnsContributed: 50_000, materialsProgress: { ore: 1000, ingot: 500 },
        status: 'active', startedAt: new Date(), completedAt: null,
        contributions: [
          { playerId: 'p1', turnsContributed: 30_000, materialsContributed: { ore: 600 } },
          { playerId: 'p2', turnsContributed: 20_000, materialsContributed: { ore: 400 } },
        ],
      },
    ]);
    db.player.findMany.mockResolvedValue([
      { id: 'p1', username: 'Alice' },
      { id: 'p2', username: 'Bob' },
    ]);

    const result = await getGuildProjects(GUILD_ID);
    expect(result).toHaveLength(1);
    expect(result[0].projectKey).toBe('guild_forge');
    expect(result[0].turnsContributed).toBe(50_000);
    expect(result[0].contributions[0].username).toBe('Alice');
  });
});

describe('contributeTurns', () => {
  it('contributes turns from player turn bank to project', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 50_000, materialsProgress: {},
      status: 'active',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.turnBank.findUnique.mockResolvedValue({
      playerId: PLAYER_ID, currentTurns: 20_000, lastRegenAt: new Date(),
    });
    db.turnBank.updateMany.mockResolvedValue({ count: 1 });
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 55_000, materialsProgress: {},
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 55_000, materialsProgress: {},
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    const result = await contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000);

    expect(result.turnsContributed).toBe(55_000);
  });

  it('contributes War Room turns from the guild turn bank', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'war_room',
      turnsContributed: 50_000, materialsProgress: {},
      status: 'active',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.guild.updateMany.mockResolvedValue({ count: 1 });
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'war_room',
      turnsContributed: 55_000, materialsProgress: {},
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'war_room',
      turnsContributed: 55_000, materialsProgress: {},
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    const result = await contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000, { source: 'guild' });

    expect(result.turnsContributed).toBe(55_000);
    expect(db.guild.updateMany).toHaveBeenCalledWith({
      where: { id: GUILD_ID, treasuryTurns: { gte: 5_000 } },
      data: { treasuryTurns: { decrement: 5_000 } },
    });
    expect(db.turnBank.updateMany).not.toHaveBeenCalled();
  });

  it('rejects guild turn bank contributions to non-War Room projects', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 50_000, materialsProgress: {},
      status: 'active',
    });

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000, { source: 'guild' }))
      .rejects.toThrow('Guild turn bank can only fund the War Room');
  });

  it('does not spend guild turns when the locked War Room turn goal is already met', async () => {
    let inTransaction = false;
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockImplementation(() => Promise.resolve({
      id: 'proj-1',
      guildId: GUILD_ID,
      projectKey: 'war_room',
      turnsContributed: inTransaction ? 150_000 : 149_000,
      materialsProgress: {},
      status: 'active',
    }));
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => {
      inTransaction = true;
      try {
        return await fn(db);
      } finally {
        inTransaction = false;
      }
    });

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000, { source: 'guild' }))
      .rejects.toThrow('Project turn goal already met');

    expect(db.guild.updateMany).not.toHaveBeenCalled();
    expect(db.guildProject.update).not.toHaveBeenCalled();
    expect(db.guildProjectContribution.upsert).not.toHaveBeenCalled();
    expect(db.turnBank.updateMany).not.toHaveBeenCalled();
  });

  it('checks the per-player turn cap against the locked contribution row before spending guild turns', async () => {
    let inTransaction = false;
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1',
      guildId: GUILD_ID,
      projectKey: 'war_room',
      turnsContributed: 50_000,
      materialsProgress: {},
      status: 'active',
    });
    db.guildProjectContribution.findUnique.mockImplementation(() => Promise.resolve({
      turnsContributed: inTransaction ? GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP - 1_000 : 0,
      materialsContributed: {},
    }));
    db.$transaction.mockImplementation(async (fn: any) => {
      inTransaction = true;
      try {
        return await fn(db);
      } finally {
        inTransaction = false;
      }
    });

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000, { source: 'guild' }))
      .rejects.toThrow('per-project turn contribution cap');

    expect(db.guild.updateMany).not.toHaveBeenCalled();
    expect(db.guildProject.update).not.toHaveBeenCalled();
    expect(db.guildProjectContribution.upsert).not.toHaveBeenCalled();
    expect(db.turnBank.updateMany).not.toHaveBeenCalled();
  });

  it('allows a clamped War Room guild-bank contribution that reaches the per-player turn cap', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1',
      guildId: GUILD_ID,
      projectKey: 'war_room',
      turnsContributed: 149_500,
      materialsProgress: {},
      status: 'active',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue({
      turnsContributed: GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP - 500,
      materialsContributed: {},
    });
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.guild.updateMany.mockResolvedValue({ count: 1 });
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'war_room',
      turnsContributed: 150_000, materialsProgress: {},
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'war_room',
      turnsContributed: 150_000, materialsProgress: {},
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    const result = await contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 1_000, { source: 'guild' });

    expect(result.turnsContributed).toBe(150_000);
    expect(db.guild.updateMany).toHaveBeenCalledWith({
      where: { id: GUILD_ID, treasuryTurns: { gte: 500 } },
      data: { treasuryTurns: { decrement: 500 } },
    });
    expect(db.guildProject.update).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { turnsContributed: { increment: 500 } },
    });
    expect(db.guildProjectContribution.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ turnsContributed: 500 }),
      update: { turnsContributed: { increment: 500 } },
    }));
  });

  it('does not update project progress when the guild turn bank has insufficient turns', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1',
      guildId: GUILD_ID,
      projectKey: 'war_room',
      turnsContributed: 50_000,
      materialsProgress: {},
      status: 'active',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.guild.updateMany.mockResolvedValue({ count: 0 });

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000, { source: 'guild' }))
      .rejects.toThrow('Insufficient guild turn bank turns');

    expect(db.guildProject.update).not.toHaveBeenCalled();
    expect(db.guildProjectContribution.upsert).not.toHaveBeenCalled();
    expect(db.turnBank.updateMany).not.toHaveBeenCalled();
  });

  it('throws if project is not active', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue(null);

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000))
      .rejects.toThrow('not found or not active');
  });

  it('throws if amount exceeds per-project cap', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 50_000, materialsProgress: {},
      status: 'active',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue({
      turnsContributed: GUILD_PROJECT_CONSTANTS.PER_PROJECT_TURN_CAP - 1000,
      materialsContributed: {},
    });

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 2_000))
      .rejects.toThrow('per-project turn contribution cap');
  });

  it('throws if player has insufficient turns', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 50_000, materialsProgress: {},
      status: 'active',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.turnBank.findUnique.mockResolvedValue({
      playerId: PLAYER_ID, currentTurns: 100, lastRegenAt: new Date(),
    });

    await expect(contributeTurns(PLAYER_ID, GUILD_ID, 'proj-1', 5_000))
      .rejects.toThrow('Insufficient turns');
  });
});

describe('contributeMaterials', () => {
  it('consumes items from inventory and updates project progress', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 500 },
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    // consumeItemsByTemplateTx mocks
    db.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 100, createdAt: new Date() },
    ]);
    db.item.update.mockResolvedValue({});
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 550 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 550 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    const result = await contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 50);

    expect(result.materialsProgress).toEqual({ ore: 550 });
  });

  it('returns inventory state updates for consumed materials', async () => {
    const updatedItem = {
      id: 'item-1',
      templateId: 'tpl-iron-ore',
      ownerId: PLAYER_ID,
      quantity: 50,
    };
    const materialTotals = { 'tpl-iron-ore': 50 };
    stateUpdateMocks.fetchItemDTOs.mockResolvedValue([updatedItem]);
    stateUpdateMocks.fetchInventoryMeta.mockResolvedValue({ inventoryUsedSlots: 3 });
    stateUpdateMocks.fetchMaterialTotals.mockResolvedValue(materialTotals);
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 500 },
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 100, createdAt: new Date() },
    ]);
    db.item.update.mockResolvedValue({});
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 550 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 550 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    const result = await contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 50);

    expect(stateUpdateMocks.fetchItemDTOs).toHaveBeenCalledWith(['item-1']);
    expect(stateUpdateMocks.fetchInventoryMeta).toHaveBeenCalledWith(PLAYER_ID);
    expect(stateUpdateMocks.fetchMaterialTotals).toHaveBeenCalledWith(PLAYER_ID);
    expect(result.stateUpdates).toEqual({
      inventoryUpdated: [updatedItem],
      inventoryUsedSlots: 3,
      materialTotals,
    });
  });

  it('throws if template is not in a required category', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: {},
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-wolf-leather', name: 'Wolf Leather', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);

    await expect(contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-wolf-leather', 50))
      .rejects.toThrow('not needed for this project');
  });

  it('auto-completes project when all goals are met', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 150_000, materialsProgress: { ore: 1000, ingot: 450 },
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ingot', name: 'Iron Ingot', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 200, createdAt: new Date() },
    ]);
    db.item.update.mockResolvedValue({});
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 150_000, materialsProgress: { ore: 1000, ingot: 500 },
      status: 'completed', startedAt: new Date(), completedAt: new Date(),
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guild.findUnique.mockResolvedValue({ id: GUILD_ID, level: 5, xp: 0n });
    db.guild.update.mockResolvedValue({});
    db.guildLog.create.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 150_000, materialsProgress: { ore: 1000, ingot: 500 },
      status: 'completed', startedAt: new Date(), completedAt: new Date(),
    });

    const result = await contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ingot', 50);

    expect(result.status).toBe('completed');
  });

  it('caps contribution to remaining needed', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 990 },
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    db.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 100, createdAt: new Date() },
    ]);
    db.item.update.mockResolvedValue({});
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 1000 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 1000 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    const result = await contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 50);
    // Only 10 should be consumed (1000 - 990 = 10 remaining)
    expect(result.materialsProgress.ore).toBe(1000);
  });

  it('uses locked material progress before consuming inventory', async () => {
    let inTransaction = false;
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockImplementation(() => Promise.resolve({
      id: 'proj-1',
      guildId: GUILD_ID,
      projectKey: 'guild_forge',
      turnsContributed: 0,
      materialsProgress: { ore: inTransaction ? 990 : 900 },
      status: 'active',
    }));
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => {
      inTransaction = true;
      try {
        return await fn(db);
      } finally {
        inTransaction = false;
      }
    });
    db.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 100, createdAt: new Date() },
    ]);
    db.item.update.mockResolvedValue({});
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 1000 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 1000 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    await contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 50);

    expect(db.item.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { quantity: 90 },
    });
    expect(db.guildProject.update).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: { materialsProgress: { ore: 1000 } },
    });
  });

  it('throws if category already fully contributed', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 1000 },
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (fn: any) => fn(db));

    await expect(contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 50))
      .rejects.toThrow('already fully contributed');
  });

  it('throws if player exceeds per-project material cap', async () => {
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 100 },
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockResolvedValue({
      turnsContributed: 0,
      materialsContributed: { ore: GUILD_PROJECT_CONSTANTS.PER_PROJECT_MATERIAL_CAP - 10 },
    });
    db.$transaction.mockImplementation(async (fn: any) => fn(db));

    await expect(contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 50))
      .rejects.toThrow('per-project material contribution cap');
  });

  it('checks material cap against the locked contribution row before consuming inventory', async () => {
    let inTransaction = false;
    db.guildMember.findUnique.mockResolvedValue({
      guildId: GUILD_ID, playerId: PLAYER_ID, role: 'member',
    });
    db.guildProject.findFirst.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 100 },
      status: 'active',
    });
    db.itemTemplate.findUnique.mockResolvedValue({
      id: 'tpl-iron-ore', name: 'Iron Ore', itemType: 'resource',
    });
    db.guildProjectContribution.findUnique.mockImplementation(() => Promise.resolve({
      turnsContributed: 0,
      materialsContributed: {
        ore: inTransaction ? GUILD_PROJECT_CONSTANTS.PER_PROJECT_MATERIAL_CAP - 5 : 0,
      },
    }));
    db.$transaction.mockImplementation(async (fn: any) => {
      inTransaction = true;
      try {
        return await fn(db);
      } finally {
        inTransaction = false;
      }
    });
    db.item.findMany.mockResolvedValue([
      { id: 'item-1', quantity: 100, createdAt: new Date() },
    ]);
    db.item.update.mockResolvedValue({});
    db.guildProject.update.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 110 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });
    db.guildProjectContribution.upsert.mockResolvedValue({});
    db.guildProject.findUnique.mockResolvedValue({
      id: 'proj-1', guildId: GUILD_ID, projectKey: 'guild_forge',
      turnsContributed: 0, materialsProgress: { ore: 110 },
      status: 'active', startedAt: new Date(), completedAt: null,
    });

    await expect(contributeMaterials(PLAYER_ID, GUILD_ID, 'proj-1', 'tpl-iron-ore', 10))
      .rejects.toThrow('per-project material contribution cap');

    expect(db.item.findMany).not.toHaveBeenCalled();
    expect(db.item.update).not.toHaveBeenCalled();
    expect(db.item.delete).not.toHaveBeenCalled();
    expect(db.guildProject.update).not.toHaveBeenCalled();
    expect(db.guildProjectContribution.upsert).not.toHaveBeenCalled();
  });
});

describe('getAvailableProjects', () => {
  it('returns L1 projects as available with no completions', async () => {
    db.guildProject.findMany.mockResolvedValue([]);
    db.guildProject.findFirst.mockResolvedValue(null);

    const result = await getAvailableProjects(GUILD_ID);
    const l1Projects = result.filter((p) => p.level === 1);
    expect(l1Projects).toHaveLength(3);
    expect(l1Projects.every((p) => p.canStart)).toBe(true);
  });

  it('marks L2 projects as unavailable without prerequisites', async () => {
    db.guildProject.findMany.mockResolvedValue([]);
    db.guildProject.findFirst.mockResolvedValue(null);

    const result = await getAvailableProjects(GUILD_ID);
    const advancedForge = result.find((p) => p.key === 'advanced_forge');
    expect(advancedForge?.canStart).toBe(false);
  });

  it('marks L2 project as available when prerequisite is completed', async () => {
    db.guildProject.findMany.mockResolvedValue([
      { projectKey: 'guild_forge', status: 'completed' },
    ]);
    db.guildProject.findFirst.mockResolvedValue(null);

    const result = await getAvailableProjects(GUILD_ID);
    const advancedForge = result.find((p) => p.key === 'advanced_forge');
    expect(advancedForge?.canStart).toBe(true);
  });
});
