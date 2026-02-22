import { describe, expect, it, vi } from 'vitest';
import { requireAdmin } from './admin';
import { AppError } from './errorHandler';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAdmin', () => {
  it('calls next() when player has admin role', () => {
    const req = { player: { playerId: 'p1', username: 'admin', role: 'admin' } } as any;
    const next = vi.fn();
    requireAdmin(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws 403 when player role is not admin', () => {
    const req = { player: { playerId: 'p1', username: 'user', role: 'player' } } as any;
    expect(() => requireAdmin(req, mockRes(), vi.fn())).toThrow(AppError);
    try { requireAdmin(req, mockRes(), vi.fn()); } catch (e: any) {
      expect(e.statusCode).toBe(403);
      expect(e.code).toBe('FORBIDDEN');
    }
  });

  it('throws 403 when req.player is undefined', () => {
    const req = {} as any;
    expect(() => requireAdmin(req, mockRes(), vi.fn())).toThrow(AppError);
  });

  it('throws 403 when role is missing', () => {
    const req = { player: { playerId: 'p1', username: 'user' } } as any;
    expect(() => requireAdmin(req, mockRes(), vi.fn())).toThrow(AppError);
  });
});
