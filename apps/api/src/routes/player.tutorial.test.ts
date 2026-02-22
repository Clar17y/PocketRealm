import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/statsService', () => ({
  incrementStats: vi.fn(),
}));
vi.mock('../services/achievementService', () => ({
  checkAchievements: vi.fn().mockResolvedValue([]),
  emitAchievementNotifications: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../services/equipmentService', () => ({
  ensureEquipmentSlots: vi.fn(),
}));
vi.mock('../services/attributesService', () => ({
  allocateAttributePoints: vi.fn(),
  getPlayerProgressionState: vi.fn(),
  normalizePlayerAttributes: vi.fn((a: any) => a),
}));
vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));

import { mockPrisma } from '../__test__/setup';
import { incrementStats } from '../services/statsService';
import { checkAchievements, emitAchievementNotifications } from '../services/achievementService';

const mockIncrementStats = incrementStats as ReturnType<typeof vi.fn>;
const mockCheckAchievements = checkAchievements as ReturnType<typeof vi.fn>;
const mockEmitAchievementNotifications = emitAchievementNotifications as ReturnType<typeof vi.fn>;

/** Mirrors the validation logic in PATCH /player/tutorial */
function isValidTutorialAdvance(currentStep: number, requestedStep: number): boolean {
  const isSkip = requestedStep === -1;
  const isNextStep = requestedStep === currentStep + 1;
  if (!isSkip && !isNextStep) return false;
  if (currentStep >= 9 || currentStep === -1) return false;
  return true;
}

describe('tutorial step validation', () => {
  it('accepts valid forward step (current + 1)', () => {
    expect(isValidTutorialAdvance(2, 3)).toBe(true);
  });

  it('accepts skip (-1)', () => {
    expect(isValidTutorialAdvance(2, -1)).toBe(true);
  });

  it('rejects skipping steps', () => {
    expect(isValidTutorialAdvance(2, 5)).toBe(false);
  });

  it('rejects going backwards', () => {
    expect(isValidTutorialAdvance(5, 3)).toBe(false);
  });

  it('rejects updating already completed tutorial', () => {
    expect(isValidTutorialAdvance(9, 10)).toBe(false);
  });

  it('rejects skipping an already completed tutorial', () => {
    expect(isValidTutorialAdvance(9, -1)).toBe(false);
  });

  it('rejects advancing an already skipped tutorial', () => {
    expect(isValidTutorialAdvance(-1, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Route-handler-level tests for PATCH /player/tutorial
// ---------------------------------------------------------------------------

import { playerRouter } from './player';

function findHandler(method: string, path: string) {
  const layer = (playerRouter as any).stack.find(
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

describe('PATCH /tutorial handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('advances tutorial step and updates DB', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 2 });
    mockPrisma.player.update.mockResolvedValue({});

    const req = { player: { playerId: 'p1' }, body: { step: 3 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(mockPrisma.player.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { tutorialStep: 3 },
    });
    expect(res.json).toHaveBeenCalledWith({ tutorialStep: 3 });
  });

  it('grants achievement when completing tutorial (step 9)', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 8 });
    mockPrisma.player.update.mockResolvedValue({});
    mockCheckAchievements.mockResolvedValue([{ id: 'tutorial_complete' }]);

    const req = { player: { playerId: 'p1' }, body: { step: 9 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(mockIncrementStats).toHaveBeenCalledWith('p1', { tutorialCompleted: 1 });
    expect(mockCheckAchievements).toHaveBeenCalledWith('p1', { statKeys: ['tutorialCompleted'] });
    expect(mockEmitAchievementNotifications).toHaveBeenCalledWith('p1', [{ id: 'tutorial_complete' }]);
  });

  it('does not grant achievement when skipping tutorial', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 3 });
    mockPrisma.player.update.mockResolvedValue({});

    const req = { player: { playerId: 'p1' }, body: { step: -1 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(mockIncrementStats).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ tutorialStep: -1 });
  });

  it('calls next with error when player not found', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    const req = { player: { playerId: 'p1' }, body: { step: 1 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('calls next with error for invalid step jump', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ tutorialStep: 2 });

    const req = { player: { playerId: 'p1' }, body: { step: 5 } } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('patch', '/tutorial');
    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, code: 'INVALID_STEP' }));
  });
});
