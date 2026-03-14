import { describe, expect, it, vi } from 'vitest';
import { mockPrisma } from '../__test__/setup';
import { requireAdmin } from './admin';
import { AppError } from './errorHandler';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAdmin', () => {
  it('calls next() without error when DB confirms admin role', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ role: 'admin' });
    const req = { player: { playerId: 'p1', username: 'admin', role: 'admin' } } as any;
    const next = vi.fn();
    await requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(mockPrisma.player.findUnique).toHaveBeenCalledWith({
      where: { id: 'p1' },
      select: { role: true },
    });
  });

  it('passes 403 error to next when DB role is not admin despite JWT claiming admin', async () => {
    mockPrisma.player.findUnique.mockResolvedValue({ role: 'player' });
    const req = { player: { playerId: 'p1', username: 'user', role: 'admin' } } as any;
    const next = vi.fn();
    await requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });

  it('passes 403 error to next when req.player is undefined', async () => {
    const req = {} as any;
    const next = vi.fn();
    await requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('passes 403 error to next when player not found in DB', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);
    const req = { player: { playerId: 'p1', username: 'user', role: 'admin' } } as any;
    const next = vi.fn();
    await requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
  });
});
