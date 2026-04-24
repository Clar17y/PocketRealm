import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../middleware/errorHandler';

const mocks = vi.hoisted(() => ({
  requireGuildMember: vi.fn(),
  getActiveContracts: vi.fn(),
  getGuildProjects: vi.fn(),
  getAvailableProjects: vi.fn(),
  getActiveUpgrades: vi.fn(),
  getAvailableUpgrades: vi.fn(),
  getSpecializationStatus: vi.fn(),
}));

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../services/guildService', () => ({
  createGuild: vi.fn(),
  getPlayerGuild: vi.fn(),
  getGuild: vi.fn(),
  searchGuilds: vi.fn(),
  updateSettings: vi.fn(),
  getGuildLog: vi.fn(),
  requireGuildMember: mocks.requireGuildMember,
}));

vi.mock('../services/guildMembershipService', () => ({
  joinGuild: vi.fn(),
  leaveGuild: vi.fn(),
  kickMember: vi.fn(),
  promoteMember: vi.fn(),
  demoteMember: vi.fn(),
  transferLeadership: vi.fn(),
  disbandGuild: vi.fn(),
  requestJoinGuild: vi.fn(),
  getJoinRequests: vi.fn(),
  respondToJoinRequest: vi.fn(),
}));

vi.mock('../services/guildUpgradeService', () => ({
  activateUpgrade: vi.fn(),
  getActiveUpgrades: mocks.getActiveUpgrades,
  getAvailableUpgrades: mocks.getAvailableUpgrades,
}));

vi.mock('../services/guildContractService', () => ({
  getActiveContracts: mocks.getActiveContracts,
}));

vi.mock('../services/guildProjectService', () => ({
  startProject: vi.fn(),
  getGuildProjects: mocks.getGuildProjects,
  getAvailableProjects: mocks.getAvailableProjects,
  contributeTurns: vi.fn(),
  contributeMaterials: vi.fn(),
}));

vi.mock('../services/guildSpecializationService', () => ({
  selectSpecialization: vi.fn(),
  respecSpecialization: vi.fn(),
  getSpecializationStatus: mocks.getSpecializationStatus,
}));

vi.mock('../services/stateUpdateHelpers', () => ({
  buildStateUpdates: vi.fn(),
}));

import { guildRouter } from './guild';

function findHandler(method: string, path: string) {
  const layer = (guildRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('guild internal read routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireGuildMember.mockRejectedValue(
      new AppError(403, 'Not a member of this guild', 'NOT_IN_GUILD'),
    );
  });

  it('blocks non-members before reading or generating contracts', async () => {
    const handler = findHandler('get', '/:id/contracts');
    const req = {
      params: { id: 'guild-target' },
      player: { playerId: 'player-1' },
      query: {},
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(mocks.requireGuildMember).toHaveBeenCalledWith('player-1', 'guild-target');
    expect(mocks.getActiveContracts).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 403,
      code: 'NOT_IN_GUILD',
    }));
  });

  it.each([
    ['/:id/upgrades', [mocks.getActiveUpgrades, mocks.getAvailableUpgrades]],
    ['/:id/projects', [mocks.getGuildProjects, mocks.getAvailableProjects]],
    ['/:id/specialization', [mocks.getSpecializationStatus]],
  ])('blocks non-members before reading %s', async (path, serviceMocks) => {
    const handler = findHandler('get', path);
    const req = {
      params: { id: 'guild-target' },
      player: { playerId: 'player-1' },
      query: {},
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(mocks.requireGuildMember).toHaveBeenCalledWith('player-1', 'guild-target');
    for (const serviceMock of serviceMocks) {
      expect(serviceMock).not.toHaveBeenCalled();
    }
    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      statusCode: 403,
      code: 'NOT_IN_GUILD',
    }));
  });
});
