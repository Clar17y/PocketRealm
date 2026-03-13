import { describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateSocket } from './socketAuth';
import { JWT_SECRET } from '../middleware/auth';

function makeSocket(auth: Record<string, unknown> = {}) {
  return {
    handshake: { auth },
    data: {} as Record<string, unknown>,
  } as any;
}

describe('authenticateSocket', () => {
  it('attaches player data on valid token', () => {
    const token = jwt.sign({ playerId: 'p1', username: 'Alice', role: 'player' }, JWT_SECRET, { expiresIn: '1h' });
    const socket = makeSocket({ token });
    const next = vi.fn();

    authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.playerId).toBe('p1');
    expect(socket.data.username).toBe('Alice');
    expect(socket.data.role).toBe('player');
  });

  it('calls next with error on missing token', () => {
    const socket = makeSocket({});
    const next = vi.fn();

    authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Missing auth token');
  });

  it('calls next with error on invalid token', () => {
    const socket = makeSocket({ token: 'garbage' });
    const next = vi.fn();

    authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Invalid or expired token');
  });

  it('calls next with error on expired token', () => {
    const token = jwt.sign({ playerId: 'p1', username: 'Alice', role: 'player' }, JWT_SECRET, { expiresIn: '-1s' });
    const socket = makeSocket({ token });
    const next = vi.fn();

    authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(next.mock.calls[0][0].message).toBe('Invalid or expired token');
  });
});
