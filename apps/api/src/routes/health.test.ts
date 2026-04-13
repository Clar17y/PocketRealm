import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../services/healthChecks', () => ({
  checkDatabase: vi.fn(),
  checkRedis: vi.fn(),
  getSocketIoStats: vi.fn(),
  isShuttingDown: vi.fn(() => false),
}));

vi.mock('../socket', () => ({
  getIo: vi.fn(() => null),
}));

vi.mock('../version', () => ({
  APP_VERSION: '1.2.3-test',
}));

import {
  checkDatabase,
  checkRedis,
  getSocketIoStats,
  isShuttingDown,
} from '../services/healthChecks';
import { healthRouter } from './health';

function buildApp() {
  const app = express();
  app.use(healthRouter);
  return app;
}

describe('health router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (isShuttingDown as any).mockReturnValue(false);
  });

  describe('GET /health/live', () => {
    it('always returns 200 { status: "ok" } without touching dependencies', async () => {
      const res = await request(buildApp()).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(checkDatabase).not.toHaveBeenCalled();
      expect(checkRedis).not.toHaveBeenCalled();
    });
  });

  describe('GET /health/ready', () => {
    it('returns 200 when DB + Redis are ok', async () => {
      (checkDatabase as any).mockResolvedValueOnce('ok');
      (checkRedis as any).mockResolvedValueOnce('ok');

      const res = await request(buildApp()).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        dependencies: { database: 'ok', redis: 'ok' },
      });
    });

    it('returns 503 when database check throws/errors', async () => {
      (checkDatabase as any).mockResolvedValueOnce('error');
      (checkRedis as any).mockResolvedValueOnce('ok');

      const res = await request(buildApp()).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.dependencies.database).toBe('error');
      expect(res.body.dependencies.redis).toBe('ok');
    });

    it('returns 503 when Redis ping fails', async () => {
      (checkDatabase as any).mockResolvedValueOnce('ok');
      (checkRedis as any).mockResolvedValueOnce('error');

      const res = await request(buildApp()).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('error');
      expect(res.body.dependencies.database).toBe('ok');
      expect(res.body.dependencies.redis).toBe('error');
    });

    it('returns 503 { status: "shutting_down" } during graceful shutdown, without probing dependencies', async () => {
      (isShuttingDown as any).mockReturnValueOnce(true);

      const res = await request(buildApp()).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: 'shutting_down' });
      expect(checkDatabase).not.toHaveBeenCalled();
      expect(checkRedis).not.toHaveBeenCalled();
    });
  });

  describe('GET /health', () => {
    it('returns expected shape with timestamp, version, uptime, dependencies', async () => {
      (checkDatabase as any).mockResolvedValueOnce('ok');
      (checkRedis as any).mockResolvedValueOnce('ok');
      (getSocketIoStats as any).mockReturnValueOnce({ connected: 7 });

      const res = await request(buildApp()).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        status: 'ok',
        version: '1.2.3-test',
        dependencies: {
          database: 'ok',
          redis: 'ok',
          socketio: { connected: 7 },
        },
      });
      expect(typeof res.body.timestamp).toBe('string');
      expect(Number.isFinite(Date.parse(res.body.timestamp))).toBe(true);
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('returns status "degraded" and 200 when a dependency is down (aggregate view, not probe)', async () => {
      (checkDatabase as any).mockResolvedValueOnce('error');
      (checkRedis as any).mockResolvedValueOnce('ok');
      (getSocketIoStats as any).mockReturnValueOnce({ connected: 0 });

      const res = await request(buildApp()).get('/health');

      // /health is informational; /health/ready is the 503 gate.
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('degraded');
      expect(res.body.dependencies.database).toBe('error');
    });

  });
});
