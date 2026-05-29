import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../middleware/seasonGuard', () => ({
  requireActiveSeason: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../services/zoneRoutesService', () => ({
  listZones: vi.fn(),
  travelToZone: vi.fn(),
}));
vi.mock('../services/activityWorkerClient', () => ({
  runActivityWithWorker: vi.fn().mockResolvedValue({ body: { ok: true } }),
}));

import { zonesRouter } from './zones';
import { runActivityWithWorker } from '../services/activityWorkerClient';

function findHandler(method: string, path: string) {
  const layer = (zonesRouter as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods[method],
  );
  if (!layer) throw new Error(`No ${method.toUpperCase()} ${path} handler found`);
  const handlers = layer.route.stack.map((s: any) => s.handle);
  return handlers[handlers.length - 1];
}

function mockRes() {
  const res: any = {};
  res.set = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('POST /zones/travel activity worker routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submits zone travel through the shared activity worker wrapper', async () => {
    const req = {
      body: { zoneId: '00000000-0000-0000-0000-000000000001' },
      player: { playerId: 'p1', username: 'Traveler' },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    const handler = findHandler('post', '/travel');
    await handler(req, res, next);

    expect(runActivityWithWorker).toHaveBeenCalledWith({
      type: 'zones.travel',
      input: { body: req.body, player: req.player },
    });
    expect(res.json).toHaveBeenCalledWith({ ok: true });
  });
});
