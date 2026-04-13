import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { APP_VERSION } from './version.js';

describe('GET /health', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: APP_VERSION,
      });
    });
  });

  it('returns ok status and APP_VERSION', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.version).toBe(APP_VERSION);
    expect(typeof res.body.timestamp).toBe('string');
  });
});
