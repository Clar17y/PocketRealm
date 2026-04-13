import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock('../services/worldEventService', () => ({
  getAllActiveEvents: vi.fn(),
  getActiveEventsForZone: vi.fn(),
  getEventById: vi.fn(),
  expireStaleEvents: vi.fn(),
}));

vi.mock('../services/eventSchedulerService', () => ({
  checkAndSpawnEvents: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => null),
}));

import { checkAndSpawnEvents } from '../services/eventSchedulerService';
import { expireStaleEvents, getAllActiveEvents } from '../services/worldEventService';
import { worldEventsRouter } from './worldEvents';

function findHandler(method: string, path: string) {
  const layer = (worldEventsRouter as any).stack.find(
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

describe('worldEvents routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /', () => {
    it('triggers catch-up before returning active events', async () => {
      const events = [{ id: 'evt-1', title: 'Storm Front' }];
      (getAllActiveEvents as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(events);

      const req = { player: { playerId: 'player-1' } } as any;
      const res = mockRes();
      const next = vi.fn();

      const handler = findHandler('get', '/');
      await handler(req, res, next);

      expect(checkAndSpawnEvents).toHaveBeenCalledTimes(1);
      expect(checkAndSpawnEvents).toHaveBeenCalledWith(null);
      expect(getAllActiveEvents).toHaveBeenCalledTimes(1);
      expect(expireStaleEvents).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ events });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
